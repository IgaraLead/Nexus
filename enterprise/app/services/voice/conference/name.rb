module Voice::Conference::Name
  def self.for(call)
    "conf_account_#{call.account_id}_call_#{call.id}"
  end
end
