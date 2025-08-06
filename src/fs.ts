import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import type { DatabaseObject, ParsedResult } from './parser.ts';
import { FileSystemError } from './errors.ts';

interface FileSystemConfig {
  readonly encoding: BufferEncoding;
  readonly dirPermissions: number;
}

const DEFAULT_CONFIG = {
  encoding: 'utf8',
  dirPermissions: 0o755,
} as const satisfies FileSystemConfig;

interface ObjectPath {
  directory: string;
  file: string;
}
export interface WriteObjectError {
  object: string;
  error: string;
}

export interface WriteObjectsSummary {
  totalObjects: number;
  writtenObjects: number;
  errors: WriteObjectError[];
  residualWritten: boolean;
}

export class FileSystem {
  private readonly dumpFile: string;
  private readonly outputDir: string;
  private readonly config: FileSystemConfig;

  constructor(
    dumpFile: string,
    outputDir = 'output',
    config: Partial<FileSystemConfig> = {}
  ) {
    this.dumpFile = this.resolvePath(dumpFile);
    this.outputDir = this.resolvePath(outputDir);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private resolvePath(inputPath: string): string {
    return isAbsolute(inputPath) ? resolve(inputPath) : resolve(process.cwd(), inputPath);
  }

  get resolvedDumpFile(): string {
    return this.dumpFile;
  }

  get resolvedOutputDir(): string {
    return this.outputDir;
  }

  async readDump(): Promise<string> {
    try {
      const dumpContent = await readFile(this.dumpFile, this.config.encoding);

      if (!dumpContent.trim()) {
        throw new FileSystemError(
          'Dump file is empty',
          'EMPTY_FILE',
          this.dumpFile
        );
      }

      return dumpContent;
    } catch (error) {
      if (error instanceof FileSystemError) {
        throw error;
      }

      if (error instanceof Error && 'code' in error) {
        if (error.code === 'ENOENT') {
          throw new FileSystemError(
            `Dump file not found: ${this.dumpFile}`,
            'FILE_NOT_FOUND',
            this.dumpFile
          );
        } else if (error.code === 'EISDIR') {
          throw new FileSystemError(
            `Path is a directory, not a file: ${this.dumpFile}`,
            'IS_DIRECTORY',
            this.dumpFile
          );
        } else if (error.code === 'EACCES') {
          throw new FileSystemError(
            `Permission denied reading: ${this.dumpFile}`,
            'PERMISSION_DENIED',
            this.dumpFile
          );
        }
      }

      throw new FileSystemError(
        `Failed to read dump file: ${error instanceof Error ? error.message : String(error)}`,
        'READ_ERROR',
        this.dumpFile
      );
    }
  }

  async writeObjects(parsedResult: ParsedResult): Promise<WriteObjectsSummary> {
    const summary: WriteObjectsSummary = {
      totalObjects: parsedResult.objects.length,
      writtenObjects: 0,
      errors: [],
      residualWritten: false,
    };

    const writePromises = parsedResult.objects.map(async (object) => {
      try {
        await this.writeObject(object);
        summary.writtenObjects++;
      } catch (error) {
        summary.errors.push({
          object: `${object.type}: ${object.qualifiedName ?? object.name}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(writePromises);

    if (parsedResult.residual) {
      try {
        const residualPath = join(this.outputDir, 'residual.sql');
        await writeFile(residualPath, parsedResult.residual, this.config.encoding);
        summary.residualWritten = true;
      } catch (error) {
        summary.errors.push({
          object: 'residual.sql',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return summary;
  }

  private async writeObject(object: DatabaseObject): Promise<void> {
    const objectPath = this.getObjectPath(object);

    await this.ensureDirectory(objectPath.directory);

    try {
      await writeFile(objectPath.file, object.definition, this.config.encoding);
    } catch (error) {
      throw new FileSystemError(
        `Failed to write ${object.type} ${basename(objectPath.file)}`,
        'WRITE_ERROR',
        objectPath.file
      );
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, {
        recursive: true,
        mode: this.config.dirPermissions,
      });
    } catch (error) {
      throw new FileSystemError(
        `Failed to create directory: ${dirPath}`,
        'MKDIR_ERROR',
        dirPath
      );
    }
  }

  private getObjectPath(object: DatabaseObject): ObjectPath {
    const directory = join(this.outputDir, `${object.type}s`);
    const filename = `${object.qualifiedName ?? object.name}.sql`;
    return {
      directory,
      file: join(directory, filename),
    };
  }
}
