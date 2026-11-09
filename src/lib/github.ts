// The shared comments code imports HttpError from the CMS's lib/github; Gitupcms has no GitHub code.
export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
