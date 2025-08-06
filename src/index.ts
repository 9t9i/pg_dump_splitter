import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
import { FileSystem } from './fs.ts';
import type { WriteObjectError } from './fs.ts';
import { Parser } from './parser.ts';
import type { ParsedResult } from './parser.ts';
import { CLIError } from './errors.ts';

interface CLIOptions {
  directory: string;
  file: string;
  help: boolean;
  dryRun: boolean;
}

interface ParsedArgs {
  directory?: string;
  file?: string;
  help?: boolean;
  'dry-run'?: boolean;
}

const DEFAULT_OPTIONS = {
  directory: 'output',
  help: false,
  dryRun: false,
} as const satisfies Partial<CLIOptions>;

const ARG_OPTIONS = {
  file: { type: 'string', short: 'f' },
  directory: { type: 'string', short: 'd' },
  'dry-run': { type: 'boolean', short: 'r' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies ParseArgsOptionsConfig;

const HELP_TEXT = `
PostgreSQL Schema Dump Splitter

Splits a PostgreSQL dump file into individual object files organized by type.

Usage:
  node src/index.ts [options]

Options:
  -f, --file <path>        Path to pg_dump file (required)
  -d, --directory <path>   Output directory (default: “output” in current working directory)
  -r, --dry-run            Parse without writing files
  -h, --help               Show this help message

Examples:
  node src/index.ts -f dump.sql
  node src/index.ts -f dump.sql -d ./schemas
  node src/index.ts --file /path/to/dump.sql --dry-run

Output Structure:
  output/
  ├── schemas/
  ├── tables/
  ├── views/
  ├── functions/
  └── residual.sql (unparsed content)
`.trim();

class CLI {
  private readonly options: CLIOptions;

  constructor(args: ParsedArgs) {
    this.options = this.validateOptions(args);
  }

  async run(): Promise<void> {
    if (this.options.help) {
      console.log(HELP_TEXT);
      return;
    }

    try {
      await this.process();
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  private validateOptions(args: ParsedArgs): CLIOptions {
    if (args.help) {
      return { ...DEFAULT_OPTIONS, file: '', help: true };
    }

    if (!args.file) {
      throw new CLIError(
        'Missing required argument: --file',
        'MISSING_ARG'
      );
    }

    return {
      file: args.file,
      directory: args.directory ?? DEFAULT_OPTIONS.directory,
      help: args.help ?? DEFAULT_OPTIONS.help,
      dryRun: args['dry-run'] ?? DEFAULT_OPTIONS.dryRun,
    };
  }

  private async process(): Promise<void> {
    const { file, directory, dryRun } = this.options;
    const startTime = performance.now();

    const filesystem = new FileSystem(file, directory);
    console.log(`Processing dump file: ${filesystem.resolvedDumpFile}`);

    console.log('Reading dump file...');
    const dumpContent = await filesystem.readDump();
    console.log(`Dump size: ${this.formatBytes(dumpContent.length)}`);

    console.log('Parsing SQL statements...');
    const parser = new Parser();
    const parsedResult = parser.parse(dumpContent);

    console.log(
      `Parsed ${parsedResult.objects.length} objects in `
        + this.formatDuration(performance.now() - startTime)
    );

    console.log('Object types:');
    this.makeObjectsSummary(parsedResult).forEach(([type, count]) => {
      console.log(`  ${type.charAt(0).toUpperCase() + type.slice(1)}s: ${count}`);
    });

    console.log('Residual content: ' + (parsedResult.residual ? 'Yes' : 'No'));

    if (dryRun) {
      console.log('Dry run mode: skipping output');
      return;
    }

    console.log(`Writing files to: ${filesystem.resolvedOutputDir}`);
    const writeObjectsSummary = await filesystem.writeObjects(parsedResult);

    console.log(`Objects written: ${writeObjectsSummary.writtenObjects}`);
    console.log(`Processing completed in ${this.formatDuration(performance.now() - startTime)}`);

    this.printWriteObjectsErrors(writeObjectsSummary.errors);
  }

  private makeObjectsSummary(parsedResult: ParsedResult): [type: string, count: number][] {
    const counts = parsedResult.objects.reduce((acc, object) => {
      acc[object.type] = (acc[object.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b));
  }

  private printWriteObjectsErrors(writeObjectsErrors: WriteObjectError[]): void {
    if (writeObjectsErrors.length > 0) {
      console.log(`\nErrors encountered: ${writeObjectsErrors.length}`);
      writeObjectsErrors.forEach(({ object, error }) => {
        console.error(`  - ${object}: ${error}`);
      });
    }
  }

  private handleError(error: unknown): void {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));

    if (error instanceof CLIError && error.code === 'MISSING_ARG') {
      console.error('\nUse --help for usage information');
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['bytes', 'kB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(0)} ms`;
    };

    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(2)} sec`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} min ${remainingSeconds.toFixed(0)} sec`;
  }
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({ options: ARG_OPTIONS, allowPositionals: false });
  const cli = new CLI(args as ParsedArgs);
  await cli.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error instanceof Error ? error.message : String(error));
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  });
}
