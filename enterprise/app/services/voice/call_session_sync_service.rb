class Voice::CallSessionSyncService
  pattr_initialize [:call!, { parent_call_sid: nil }]

  def perform
    record_parent_call_sid!
    call
  end

  private

  def record_parent_call_sid!
    return if parent_call_sid.blank?
    return if call.parent_call_sid == parent_call_sid

    call.update!(parent_call_sid: parent_call_sid)
  end
end
