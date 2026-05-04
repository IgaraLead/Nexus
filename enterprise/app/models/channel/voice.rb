# Stub for legacy inboxes whose channel_type is still 'Channel::Voice' after
# the upstream DropChannelVoice migration moved voice fields onto
# Channel::TwilioSms. Pointing at the new table lets Rails resolve
# `belongs_to :channel, polymorphic: true` lookups to nil (no matching row),
# so jbuilder `.try` chains short-circuit instead of raising.
class Channel::Voice < ApplicationRecord
  self.table_name = 'channel_twilio_sms'
end
