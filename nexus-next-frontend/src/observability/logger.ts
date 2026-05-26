type LogContext = Record<string, unknown>;

const log = (level: 'error' | 'info' | 'warn', message: string, context?: LogContext) => {
  const payload = context ? [message, context] : [message];

  console[level](...payload);
};

export const logger = {
  error: (message: string, context?: LogContext) => log('error', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
};
