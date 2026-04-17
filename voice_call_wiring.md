# Implementation plan: Wire unified `Call` model into the Twilio voice flow

The `Call` model (`enterprise/app/models/call.rb`) and `calls` migration (`db/migrate/20260408170902_create_calls.rb`) are already merged. This plan covers the remaining work: wiring the Twilio voice flow to the `Call` model, moving state out of `conversation.additional_attributes` / `conversation.identifier`, and supporting multiple calls per conversation for `lock_to_single_conversation` inboxes.

No data migration — feature branch only.

## Guiding principles

- Single source of truth for call state is the `Call` record. Nothing call-related lives on `conversation.additional_attributes` anymore.
- `conversation.identifier` is **not** used for voice anymore. Lookups go through `Call.find_by(provider: :twilio, provider_call_id: call_sid)`.
- Conference naming keys off the `Call` id: `conf_account_{account_id}_call_{call_id}`.
- Messages match to calls by `content_attributes.data.call_sid` — each call gets its own bubble.
- Standardized `voice_call` message `content_attributes.data` schema: `call_sid, status, call_direction, from_number, to_number, duration, recording_url, transcript, conference_sid`. Treated as a display projection of the `Call`, written by `CallMessageBuilder` / `CallStatus::Manager`.
- Status values split: Call model uses underscored (`in_progress`, `no_answer`); message `content_attributes.data.status` uses hyphenated (`in-progress`, `no-answer`). `CallStatus::Manager` translates via `call.status.tr('_', '-')`.
- `call_direction` on the frontend-facing payload uses `inbound`/`outbound` (via `Call#display_direction`) to match what `voice.js` and `ConversationCard.vue` already expect.
- Conversation reuse: when `inbox.lock_to_single_conversation` is true, incoming calls append to the most recent non-resolved conversation for `(contact, inbox)`. Otherwise, create a new conversation. Each call gets its own `Call` record and `voice_call` message either way.
- `ConversationCard.vue` derives its call badge from the latest `voice_call` message (`content_type === 'voice_call'`), not from a cache on the conversation. This keeps the card correct when subsequent non-call messages (SMS, notes, etc.) arrive after a call.

## 1. Call model adjustments

`enterprise/app/models/call.rb`

| Change | Notes |
|---|---|
| Add convenience accessors for Twilio `meta` keys | `conference_sid`, `conference_sid=`, `recording_sid`, `parent_call_sid`, `initiated_at`, `started_at`, `ended_at` — all read/write `self.meta ||= {}` |
| Enum values | `provider: { twilio: 0, whatsapp: 1 }`, `direction: { incoming: 0, outgoing: 1 }` (matches current branch) |
| Keep `belongs_to :contact` | Denormalized for easier queries |
| Add scope `find_by_provider_call_id(provider, sid)` | One-liner for webhook lookups |

## 2. Conference naming

`enterprise/app/services/voice/conference/name.rb`

- Change `for(conversation)` → `for(call)` returning `"conf_account_#{call.account_id}_call_#{call.id}"`.
- Update all call sites (`OutboundCallBuilder`, `InboundCallBuilder`, conference manager lookups).

## 3. `InboundCallBuilder`

`enterprise/app/services/voice/inbound_call_builder.rb`

- Find/create contact (unchanged).
- Find/create conversation:
  - When `inbox.lock_to_single_conversation` is true: return the most recent non-resolved conversation for `(contact, inbox)`; otherwise `ConversationBuilder.new(...).perform`.
  - Do **not** set `conversation.identifier`.
  - Do **not** write `call_*` keys to `conversation.additional_attributes`.
- Create the `Call` record:
  ```ruby
  Call.create!(
    account:, inbox:, conversation:, contact:,
    provider: :twilio,
    direction: :incoming,
    status: 'ringing',
    provider_call_id: call_sid,
    meta: { initiated_at: Time.current.to_i }
  )
  ```
- Set `call.conference_sid = Voice::Conference::Name.for(call)` and save.
- Invoke `CallMessageBuilder` with the `Call`; after message creation, `call.update!(message_id: message.id)`.

## 4. `OutboundCallBuilder`

`enterprise/app/services/voice/outbound_call_builder.rb`

- Create conversation (no `identifier`).
- Create `Call` record with `status: 'ringing'`, `direction: :outgoing`, no `provider_call_id` yet.
- Generate `conference_sid` via `Voice::Conference::Name.for(call)`, save on `Call`.
- Call `inbox.channel.initiate_call(to:, conference_sid:, agent_id:)` → on response, set `call.provider_call_id = call_sid`, `call.accepted_by_agent_id = user.id`, save.
- Do **not** set `conversation.additional_attributes['agent_id']` — it moves to `call.accepted_by_agent_id`.
- Invoke `CallMessageBuilder`, link `call.message_id`.

## 5. `CallMessageBuilder`

`enterprise/app/services/voice/call_message_builder.rb`

- Accept `call` as input.
- Lookup: `conversation.messages.find { |m| m.content_type == 'voice_call' && m.content_attributes.dig('data', 'call_sid') == call.provider_call_id }` — not "latest voice_call message in conversation".
- On create, set `content_attributes.data` from the `Call` record using the standardized schema:
  - `call_sid` — `call.provider_call_id`
  - `status` — hyphenated (`call.status.tr('_', '-')`)
  - `call_direction` — `call.direction`
  - `from_number`, `to_number` — from the webhook payload
  - `duration` — nil until terminal
  - `recording_url`, `transcript` — nil (filled by recording/transcription flow, out of scope)
  - `conference_sid` — `call.conference_sid`
  - `meta.ringing_at` — timestamp
- Return the message so the caller can set `call.message_id`.

## 6. `StatusUpdateService` + `CallStatus::Manager`

`enterprise/app/services/voice/status_update_service.rb`

- Lookup: `Call.find_by(provider: :twilio, provider_call_id: call_sid)` instead of `Conversation.find_by(identifier:)`.
- Delegate to `CallStatus::Manager` with the `Call`.

`enterprise/app/services/voice/call_status/manager.rb`

- Update `call.status`, `call.duration_seconds`, `call.started_at` (when entering `in_progress`), `call.meta[:ended_at]` (on terminal).
- Bump `conversation.last_activity_at` so the conversation surfaces in the list on call activity.
- Update the matching voice_call message via `CallMessageBuilder`, matched by `call_sid`. The message's `content_attributes.data.status` (hyphenated) and `data.duration` are refreshed from the `Call`.
- No writes to `conversation.additional_attributes`.

## 7. `ConferenceManager` + `ConferenceService`

`enterprise/app/services/voice/conference/manager.rb`

- Look up `Call` via `conference_sid` (stored on `Call`, not on conversation).
- On `join` (agent): `call.update!(status: 'in_progress', accepted_by_agent_id: user_id)`. User ID resolved from the `ParticipantLabel` on the webhook (`agent-{user_id}-account-{account_id}`) — authoritative source. See **Agent identity resolution** below.
- On `leave` / `end`: `call.update!(status: …, duration_seconds: …)`.
- Remove `agent_joined` / `joined_at` / `joined_by` writes to `additional_attributes`.

**Agent identity resolution (participant label flow):**

1. Agent's browser Device SDK connects using JWT with identity `agent-{user_id}-account-{account_id}` (already set in `token_service.rb`).
2. Twilio hits TwiML endpoint with `From=client:agent-{user_id}-account-{account_id}`.
3. VoiceController parses the identity from `From`, renders `<Dial>` with `participantLabel="agent-{user_id}-account-{account_id}"`.
4. Conference `participant-join` webhook includes the label; `ConferenceManager` parses `user_id` from it and calls `call.update!(accepted_by_agent_id: user_id)`.

This is stateless — no ordering dependency between the frontend `/conference#create` API call and the Twilio webhook. `/conference#create` still runs (for frontend intent/UI), but the webhook is the authoritative source for `accepted_by_agent_id`.

`enterprise/app/services/voice/provider/twilio/conference_service.rb`

- `ensure_conference_sid(call)` replaces reading/writing `conversation.additional_attributes['conference_sid']`.
- `end_conference(call)` uses `call.conference_sid` from the Call record.

## 8. `CallSessionSyncService`

`enterprise/app/services/voice/call_session_sync_service.rb`

- Trivial post-refactor — takes the `Call` (resolved by the controller via `parent_call_sid` or `call_sid`) and records `parent_call_sid` in `call.meta` for `outbound-dial` child legs. That's it.
- All other data (`conference_sid`, `direction`, `accepted_by_agent_id`) is already on the `Call`; nothing to reconcile.

## 9. `Twilio::VoiceController`

`enterprise/app/controllers/twilio/voice_controller.rb`

- Incoming (`POST /twilio/voice/call/:phone` with Twilio `Direction=inbound`): delegates to `InboundCallBuilder` — no `identifier` hack.
- Twilio `Direction=outbound-api` / `outbound-dial`: resolve the parent `Call` by `parent_call_sid` from Twilio params → `Call.find_by(provider: :twilio, provider_call_id: parent_sid)` → pass to `CallSessionSyncService`.
- Conference status callback: resolve `Call` by `conference_sid` (friendly_name).
- Status callback: resolve `Call` by `call_sid` via `StatusUpdateService`.

## 10. API controllers

`enterprise/app/controllers/api/v1/accounts/conference_controller.rb`

- `#token` — unchanged (no call record needed yet).
- `#create` (agent joins) — resolve the `Call` by `conversation_id` or a new `call_id` param; call `ConferenceService.ensure_conference_sid(call)` and `mark_agent_joined(call, user)`.
- `#destroy` — ends the conference for the `Call`.

`enterprise/app/controllers/api/v1/accounts/contacts/calls_controller.rb`

- Return `call: CallSerializer.render_as_json(call, view: :base)` (new) with `id, provider_call_id, conference_sid, status, direction` — keep returning `conversation_id, inbox_id` for frontend compat.

## 11. Frontend and cleanup

**Conversation card** — `app/javascript/dashboard/components/widgets/conversation/ConversationCard.vue`

- `voiceCallData` reads from `lastMessageInChat.content_attributes.data` only when that message's `content_type === 'voice_call'`. Otherwise it returns `{ status: null, direction: null }` and the normal `MessagePreview` branch renders. Fixes the "Call ended" stale-card bug when a text message follows a call.

**Store mutation** — `app/javascript/dashboard/store/`

- `UPDATE_CONVERSATION_CALL_STATUS` mutation, its type, and the corresponding `commit` in `helper/voice.js` are removed. Only `UPDATE_MESSAGE_CALL_STATUS` remains (which updates the matched voice_call message's `content_attributes.data.status`).

**Enterprise Conversation override** — `enterprise/app/models/enterprise/conversation.rb`

- `allowed_keys?` override removed. It existed solely to dispatch `conversation.updated` events on `additional_attributes.call_status` changes; obsolete now that call state doesn't live on the conversation. The voice_call message still dispatches `message.updated` on status transitions, which is what the frontend listens to.

**Backend cleanup**

- `conversation.identifier` — no voice writes or reads remain.
- `conversation.additional_attributes` — no voice writes remain. All state (`conference_sid`, `agent_id`, `call_started_at/ended_at`, `call_duration`, `agent_joined`, `joined_at`, `joined_by`, `call_status`, `call_direction`) lives on the `Call` record.
- Existing conversations may carry stale call-state keys in their `additional_attributes` JSONB. Not cleaned up — feature branch, no production data, and nothing reads them anymore.

## 12. Specs

Behavior changes force updates to existing specs. New specs deferred per CLAUDE.md unless explicitly requested.

| File | Update |
|---|---|
| `spec/factories/calls.rb` | Add if missing — traits `:twilio_incoming`, `:twilio_outgoing`, `:whatsapp_incoming`, `:whatsapp_outgoing` |
| `spec/enterprise/services/voice/inbound_call_builder_spec.rb` | Assert `Call` is created with right attrs + linked message; drop `conversation.identifier` assertions |
| `spec/enterprise/services/voice/outbound_call_builder_spec.rb` | Same |
| `spec/enterprise/services/voice/status_update_service_spec.rb` | Find the `Call`, not the conversation; assert updates on it |
| `spec/enterprise/services/voice/call_session_sync_service_spec.rb` | Resolve via parent call record |
| `spec/enterprise/controllers/twilio/voice_controller_spec.rb` | Update lookups |
| `spec/enterprise/services/voice/conference/manager_spec.rb` | If exists — update |
| `spec/enterprise/models/call_spec.rb` | **Optional** — only if explicit coverage for enums/scopes/validations is wanted |

## 13. Out of scope (for this PR)

- WhatsApp voice wiring to `Call` — no WhatsApp voice services on this branch; slots in later.
- `recording` attachment flow (Twilio recording download + Whisper transcription).
- Multiple-calls-per-conversation UI polish — backend supports it; UI verification deferred.
- Collapsing `voice_call` message `content_attributes.data` into a pointer + embedding the `Call` in the message serializer. Considered and deferred — the current duplication is consistent with how other message types work (self-contained display payloads), avoids N+1 risk when loading messages, and is written by a single service so drift is managed. Revisit if the duplication starts causing bugs or when WhatsApp voice is wired in.

## Implementation order

One commit per step:

1. Step 1 (Call model helpers) + Step 2 (Conference::Name)
2. Step 3 (InboundCallBuilder) + Step 5 (CallMessageBuilder)
3. Step 4 (OutboundCallBuilder)
4. Step 6 (StatusUpdateService + CallStatus::Manager)
5. Step 7 (ConferenceManager + ConferenceService)
6. Step 8 (CallSessionSyncService)
7. Step 9 (VoiceController)
8. Step 10 (API controllers)
9. Step 11 (cleanup sweep: grep for `conversation.identifier` and `additional_attributes['call_…']` in `enterprise/app/services/voice/**` and `enterprise/app/controllers/**/voice*`)
10. Step 12 (spec updates) — bundle with the step that changes the behavior

## Decisions

1. **`Call#contact_id`** — kept. Denormalized for easier queries.
2. **Enum naming** — `direction: { incoming: 0, outgoing: 1 }` (matches current branch).
3. **Agent identity on conference `join` webhook** — resolved via `ParticipantLabel` (`agent-{user_id}-account-{account_id}`). Stateless, no ordering dependency on `/conference#create`. See §7 **Agent identity resolution**.
