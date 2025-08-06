# PostgreSQL Schema Dump Splitter

A TypeScript/Node.js CLI tool for processing PostgreSQL schema dumps. It parses a dump file and splits it into a structured directory tree, writing database objects to individual `schema.object_name.sql` files within type-specific subdirectories, with constraint inlining and index organisation.

## Features

- **Object Classification**: Identifies and categorises:
  - Schemas (`CREATE SCHEMA`)
  - Extensions (`CREATE EXTENSION`)
  - Functions (`CREATE [OR REPLACE] FUNCTION`)
  - Procedures (`CREATE [OR REPLACE] PROCEDURE`)
  - Tables (`CREATE TABLE`)
  - Views (`CREATE VIEW`, `CREATE MATERIALIZED VIEW`)
  - Types (`CREATE TYPE`)
  - Domains (`CREATE DOMAIN`)
- **Sequence Handling**: Processes `ALTER TABLE ... ADD GENERATED ... AS IDENTITY` statements and inlines them into table definitions
- **Constraint Inlining**: Extracts `ALTER TABLE ... ADD CONSTRAINT` statements and inlines them into table definitions
- **Index Appending**: Appends `CREATE INDEX` statements to their corresponding table files
- **Residual Handling**: Captures unclassified content (SET statements, comments) in `residual.sql`
- **Dependency-Free**: Uses only Node.js built-in modules (v23+ required for TypeScript support)

## Installation

No dependencies required! Uses Node.js v23+ built-in TypeScript support for type stripping.

```bash
git clone https://github.com/9t9i/pg_dump_splitter
cd pg_dump_splitter
```

## Usage

### Process a dump file
```bash
node src/index.ts --file dump.sql --directory ./output
```

### Dry run (test parsing without writing output files)
```bash
node src/index.ts --file dump.sql --dry-run
```

### Using npm script
```bash
npm start -- --file test_dump.sql --directory ./output
```

## Command Line Options

| Option | Short | Description | Required |
|--------|-------|-------------|----------|
| `--file` | `-f` | Path to PostgreSQL dump file | Yes |
| `--directory` | `-d` | Output directory | No (default: `./output`) |
| `--dry-run` | `-r` | Parse without writing files | No |
| `--help` | `-h` | Show help message | No |

## Output Structure

```
output_directory/
├── schemas/
│   └── schema_name.sql
├── extensions/
│   ├── public.extension_name.sql
├── domains/
│   ├── public.user_status_d.sql
├── functions/
│   ├── public.calculate_age.sql
│   ├── public.user_audit.sql
│   └── schema_name.function_name.sql
├── procedures/
│   └── public.procedure_name.sql
├── tables/
│   ├── public.users.sql          # With inlined sequences & constraints and appended indexes
│   └── schema_name.table_name.sql
├── types/
│   ├── public.user_status.sql
│   └── schema_name.type_name.sql
├── views/
│   ├── public.active_users.sql
│   └── schema_name.view_name.sql
└── residual.sql                  # SET statements, comments, unclassified content
```

## Technical Details

### File Naming Convention
All output files follow the pattern: `schema_name.object_name.sql`
The exception is schema objects, which use just the schema name: `schema_name.sql`

### Sequence Processing
- Identity sequences from `ALTER TABLE ... ADD GENERATED ... AS IDENTITY` are inlined into table column definitions
- Sequence definitions are extracted and attached to the appropriate table columns

### Constraint Processing
- Table constraints from `ALTER TABLE ... ADD CONSTRAINT` statements are automatically extracted
- Constraints are inlined into the table definition before the closing parenthesis
- Original constraint syntax is preserved with proper `CONSTRAINT name definition` format

### Index Processing
- Indexes are identified by `CREATE [UNIQUE] INDEX ... ON table_name` patterns
- Indexes are appended to their corresponding table's `.sql` file after the table definition

### Dollar Quote Parsing
The parser handles PostgreSQL's dollar quoting mechanism using the regex pattern:
```
\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$
```
This correctly identifies:
- Anonymous dollar quotes: `$$...$$`
- Named dollar quotes: `$BODY$...$BODY$`, `$function$...$function$`
- Nested dollar quotes with different tags

## Architecture

The application consists of four main modules:

- **`src/index.ts`**: Main entry point, CLI argument parsing, and orchestration
- **`src/fs.ts`**: File system operations and directory structure creation
- **`src/parser.ts`**: SQL parsing engine with dollar quote support and object classification
- **`src/errors.ts`**: Custom error classes for file system, parsing, and CLI errors

## Testing

The SQL parser has comprehensive test coverage including edge cases for dollar quotes, nested comments, and other complex structures. If AVA is installed (npm install ava --save-dev --no-save), tests can be run via `npm test`.

## Requirements

- Node.js v23.0.0 or higher (with type stripping support)
- Optionally, AVA for running the tests

## License

See LICENSE file for details.