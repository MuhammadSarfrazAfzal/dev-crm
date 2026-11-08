-- Add call_hangup outcome for customer hang-ups
alter type public.call_outcome add value if not exists 'call_hangup' after 'not_interested';
