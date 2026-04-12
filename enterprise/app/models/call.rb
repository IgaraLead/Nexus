class Call < ApplicationRecord
  # All valid call statuses
  STATUSES = %w[ringing in_progress completed no_answer failed].freeze
  # Statuses where the call is finished and won't change again
  TERMINAL_STATUSES = %w[completed no_answer failed].freeze

  enum :provider, { twilio: 0, whatsapp: 1 }
  enum :direction, { incoming: 0, outgoing: 1 }

  belongs_to :account
  belongs_to :inbox
  belongs_to :conversation
  belongs_to :message, optional: true
  belongs_to :accepted_by_agent, class_name: 'User', optional: true

  has_one_attached :recording

  validates :provider_call_id, presence: true
  validates :provider, presence: true
  validates :direction, presence: true
  validates :status, presence: true, inclusion: { in: STATUSES }

  scope :active, -> { where.not(status: TERMINAL_STATUSES) }
end
