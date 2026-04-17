class Voice::Conference::Manager
  pattr_initialize [:call!, :event!, :participant_label]

  AGENT_LABEL_PATTERN = /\Aagent-(\d+)-account-(\d+)\z/

  def process
    case event
    when 'start'
      mark_ringing!
    when 'join'
      join_agent! if agent_participant?
    when 'leave'
      handle_leave!
    when 'end'
      finalize!
    end
  end

  private

  def status_manager
    @status_manager ||= Voice::CallStatus::Manager.new(call: call)
  end

  def mark_ringing!
    status_manager.process_status_update('ringing')
  end

  def join_agent!
    user_id = extract_user_id
    call.update!(accepted_by_agent_id: user_id) if user_id
    status_manager.process_status_update('in_progress', timestamp: now)
  end

  def handle_leave!
    case call.status
    when 'ringing'
      status_manager.process_status_update('no_answer', timestamp: now)
    when 'in_progress'
      status_manager.process_status_update('completed', timestamp: now)
    end
  end

  def finalize!
    return if Call::TERMINAL_STATUSES.include?(call.status)

    status_manager.process_status_update('completed', timestamp: now)
  end

  def agent_participant?
    participant_label.to_s.start_with?('agent-')
  end

  def extract_user_id
    match = participant_label.to_s.match(AGENT_LABEL_PATTERN)
    match && match[1].to_i
  end

  def now
    Time.zone.now.to_i
  end
end
