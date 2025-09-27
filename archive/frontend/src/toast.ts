let handler: (_msg: string) => void = () => {};

export const setErrorHandler = (fn: (_msg: string) => void) => {
  handler = fn;
};

export const notifyError = (msg: string) => {
  handler(msg);
};
