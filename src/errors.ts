type FileSystemErrorCode = 'EMPTY_FILE' | 'FILE_NOT_FOUND' | 'IS_DIRECTORY' | 'MKDIR_ERROR'
  | 'PERMISSION_DENIED' | 'READ_ERROR' | 'WRITE_ERROR';

type CLIErrorCode = 'MISSING_ARG' | 'INVALID_PATH' | 'PARSE_FAILED';

export class FileSystemError extends Error {
  readonly name = 'FileSystemError';
  public readonly code: FileSystemErrorCode;
  public readonly path?: string;

  constructor(
    message: string,
    code: FileSystemErrorCode,
    path?: string
  ) {
    super(message);
    this.code = code;
    this.path = path;
  }
}

export class ParseError extends Error {
  readonly name = 'ParseError';
  public readonly statement?: string;
  public readonly position?: number;

  constructor(
    message: string,
    statement?: string,
    position?: number
  ) {
    super(message);
    this.statement = statement;
    this.position = position;
  }
}

export class CLIError extends Error {
  readonly name = 'CLIError';
  public readonly code: CLIErrorCode;

  constructor(
    message: string,
    code: CLIErrorCode
  ) {
    super(message);
    this.code = code;
  }
}
