export type DatabaseObjectType =
  'schema' | 'extension' | 'type' | 'domain' | 'function' | 'procedure' |'table' | 'view';

export type QualifiedName<
  TSchema extends string = string,
  TName extends string = string
> = `${TSchema}.${TName}`;

interface BaseParsedStatement {
  schema: string;
  name: string;
  definition: string;
  residual?: string;
}

interface GeneralParsedStatement extends BaseParsedStatement {
  type: DatabaseObjectType;
  qualifiedName: QualifiedName;
}

interface SchemaParsedStatement extends BaseParsedStatement {
  type: 'schema';
}

interface SequenceParsedStatement extends BaseParsedStatement {
  type: 'sequence',
  qualifiedName: QualifiedName;
  tableSchema: string;
  table: string;
  column: string;
}

interface ConstraintParsedStatement extends BaseParsedStatement {
  type: 'constraint';
  qualifiedName: QualifiedName;
  table: string;
}

interface IndexParsedStatement extends BaseParsedStatement {
  type: 'index';
  qualifiedName: QualifiedName;
  table: string;
}

type AttachableParsedStatement = SequenceParsedStatement
  | ConstraintParsedStatement | IndexParsedStatement;

type ParsedStatement = GeneralParsedStatement | SchemaParsedStatement | AttachableParsedStatement;

type AttachablesByTable = Record<QualifiedName, {
  sequences: SequenceParsedStatement[];
  constraints: ConstraintParsedStatement[];
  indexes: IndexParsedStatement[];
}>;

export interface DatabaseObject {
  readonly type: DatabaseObjectType;
  readonly schema: string;
  readonly name: string;
  readonly qualifiedName?: QualifiedName;
  definition: string;
  sequences?: readonly string[];
  constraints?: readonly string[];
  indexes?: readonly string[];
};

export interface ParsedResult {
  readonly objects: readonly DatabaseObject[];
  readonly residual: string;
}

const IDENTIFIER_PATTERN = '(?:[_\\p{L}][_\\p{L}\\p{N}$]*|"(?:[^"]|"")+")';
const SCHEMA_QUALIFIED_OBJECT_PATTERN = `(?:(${IDENTIFIER_PATTERN})\\.)?(${IDENTIFIER_PATTERN})`;    // capture groups for schema name and object name
const DEFAULT_SCHEMA = 'public';

function makeQualifiedName<
  S extends string, N extends string
>(schema: S, name: N): QualifiedName<S, N> {
  return `${schema}.${name}`;
};

abstract class BaseParser {
  abstract readonly type: DatabaseObjectType | 'sequence' | 'constraint' | 'index';
  abstract readonly regex: RegExp;

  abstract parse(match: RegExpExecArray, statement: string): ParsedStatement;

  protected extractDefinition(
    match: RegExpExecArray, statement: string
  ): { definition: string; residual?: string } {
    if (match.index) {
      return {
        definition: statement.slice(match.index),
        residual: statement.slice(0, match.index),
      };
    }
    return { definition: statement };
  }
}

abstract class GeneralParser extends BaseParser {
  abstract readonly type: DatabaseObjectType;

  parse(match: RegExpExecArray, statement: string): GeneralParsedStatement {
    const schema = match[1] ?? DEFAULT_SCHEMA;
    const name = match[2];
    return {
      type: this.type,
      schema,
      name,
      qualifiedName: makeQualifiedName(schema, name),
      ...this.extractDefinition(match, statement),
    };
  }
}

class SchemaParser extends BaseParser {
  readonly type = 'schema';
  readonly regex = new RegExp(`CREATE\\s+SCHEMA\\s+(${IDENTIFIER_PATTERN})`, 'iu');                  // capture group 1 = schema name

  parse(match: RegExpExecArray, statement: string): SchemaParsedStatement {
    const schema = match[1];
    return {
      type: this.type,
      schema,
      name: schema,
      ...this.extractDefinition(match, statement),
    };
  }
}

class ExtensionParser extends GeneralParser {
  readonly type = 'extension';
  readonly regex = new RegExp('CREATE\\s+EXTENSION\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'
    + `(${IDENTIFIER_PATTERN})(?:(?:\\s+WITH)?(?:\\s+SCHEMA)?\\s+(${IDENTIFIER_PATTERN}))?`, 'iu');  // capture group 1 = extension name; capture group 2 = schema name

  parse(match: RegExpExecArray, statement: string): GeneralParsedStatement {
    const schema = match[2] ?? DEFAULT_SCHEMA;
    const name = match[1];
    return {
      type: this.type,
      schema,
      name,
      qualifiedName:makeQualifiedName(schema, name),
      ...this.extractDefinition(match, statement),
    };
  }
}

class TypeParser extends GeneralParser {
  readonly type = 'type';
  readonly regex = new RegExp(`CREATE\\s+TYPE\\s+${SCHEMA_QUALIFIED_OBJECT_PATTERN}`, 'iu');         // capture group 1 = schema name; capture group 2 = type name
}

class DomainParser extends GeneralParser {
  readonly type = 'domain';
  readonly regex = new RegExp(`CREATE\\s+DOMAIN\\s+${SCHEMA_QUALIFIED_OBJECT_PATTERN}`, 'iu');       // capture group 1 = schema name; capture group 2 = domain name
}

class FunctionParser extends GeneralParser {
  readonly type = 'function';
  readonly regex = new RegExp(`CREATE\\s+FUNCTION\\s+${SCHEMA_QUALIFIED_OBJECT_PATTERN}`, 'iu');     // capture group 1 = schema name; capture group 2 = function name
}

class ProcedureParser extends GeneralParser {
  readonly type = 'procedure';
  readonly regex = new RegExp(`CREATE\\s+PROCEDURE\\s+${SCHEMA_QUALIFIED_OBJECT_PATTERN}`, 'iu');    // capture group 1 = schema name; capture group 2 = procedure name
}

class TableParser extends GeneralParser {
  readonly type = 'table';
  readonly regex = new RegExp('CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+'
    + SCHEMA_QUALIFIED_OBJECT_PATTERN, 'iu');                                                        // capture group 1 = schema name; capture group 2 = table name
}

class SequenceParser extends BaseParser {
  readonly type = 'sequence';
  readonly regex = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${SCHEMA_QUALIFIED_OBJECT_PATTERN}`    // capture group 1 = table schema name; capture group 2 = table name;
    + `\\s+ALTER\\s+(?:COLUMN\\s+)?(${IDENTIFIER_PATTERN})\\s+ADD\\s+`                               // capture group 3 = table column name
    + 'GENERATED\\s+(?:ALWAYS|BY\\s+DEFAULT)\\s+AS\\s+IDENTITY\\s+'
    + `\\(\\s*SEQUENCE\\s+NAME\\s+${SCHEMA_QUALIFIED_OBJECT_PATTERN}.*\\)\\s*;[^;]*$`, 'isu');       // capture group 4 = sequence schema; capture group 5 = sequence name

  parse(match: RegExpExecArray, statement: string): SequenceParsedStatement {
    const schema = match[4] ?? DEFAULT_SCHEMA;
    const name = match[5];
    return {
      type: this.type,
      schema,
      name,
      qualifiedName: makeQualifiedName(schema, name),
      tableSchema: match[1] ?? DEFAULT_SCHEMA,
      table: match[2],
      column: match[3],
      ...this.extractDefinition(match, statement),
    };
  }
}

class ViewParser extends GeneralParser {
  readonly type = 'view';
  readonly regex = new RegExp('CREATE\\s+(?:RECURSIVE\\s+|MATERIALIZED\\s+)?VIEW\\s+'
    + SCHEMA_QUALIFIED_OBJECT_PATTERN, 'iu');                                                        // capture group 1 = schema name; capture group 2 = view name
}

class ConstraintParser extends BaseParser {
  readonly type = 'constraint';
  readonly regex = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${SCHEMA_QUALIFIED_OBJECT_PATTERN}`    // capture group 1 = schema name; capture group 2 = table name;
    + `\\s+ADD\\s+CONSTRAINT\\s+(${IDENTIFIER_PATTERN})`, 'iu');                                     // capture group 3 = constraint name

  parse(match: RegExpExecArray, statement: string): ConstraintParsedStatement {
    const schema = match[1] ?? DEFAULT_SCHEMA;
    const name = match[3];
    return {
      type: this.type,
      schema,
      name,
      qualifiedName: makeQualifiedName(schema, name),
      table: match[2],
      ...this.extractDefinition(match, statement),
    };
  }
}

class IndexParser extends BaseParser {
  readonly type = 'index';
  readonly regex = new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:(${IDENTIFIER_PATTERN})\\s+)?`   // capture group 1 = index name
    + `ON\\s+(?:ONLY\\s+)?${SCHEMA_QUALIFIED_OBJECT_PATTERN}`, 'iu');                                // capture group 2 = schema name; capture group 3 = table name

  parse(match: RegExpExecArray, statement: string): IndexParsedStatement {
    const schema = match[2] ?? DEFAULT_SCHEMA;
    const name = match[1];
    return {
      type: this.type,
      schema,
      name,
      qualifiedName: makeQualifiedName(schema, name),
      table: match[3],
      ...this.extractDefinition(match, statement),
    };
  }
}

export class Parser {
  private static readonly TABLE_HEADER_REGEX = new RegExp('CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+'
    + SCHEMA_QUALIFIED_OBJECT_PATTERN + '\\s*(?=\\()', 'iu');

  private static readonly SEQUENCE_HEADER_REGEX = new RegExp('ALTER\\s+TABLE\\s+(?:ONLY\\s+)?'
    + SCHEMA_QUALIFIED_OBJECT_PATTERN
    + `\\s+ALTER\\s+(?:COLUMN\\s+)?${IDENTIFIER_PATTERN}\\s+ADD\\s+`, 'iu');

  private static readonly CONSTRAINT_DEFINITION_REGEX =
    new RegExp(`ADD\\s+CONSTRAINT\\s+(${IDENTIFIER_PATTERN})\\s+(.+);[^;]*$`, 'iu');                 // capture group 1 = constraint name; capture group 2 = constraint definition minus terminating semicolon

  private static readonly DOLLAR_QUOTE_REGEX = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

  private static readonly UNSAFE_REGEX_CHARACTERS_REGEX = /[-/\\^$*+?.()|[\]{}]/;
  private static readonly UNSAFE_REGEX_CHARACTERS_REPLACEMENT = '\\$&';

  private static readonly TABLE_COLUMN_REGEX_CACHE = new Map<string, RegExp>();

  private static readonly PARSER_REGISTRY = [
    new SchemaParser(),
    new ExtensionParser(),
    new TypeParser(),
    new DomainParser(),
    new FunctionParser(),
    new ProcedureParser(),
    new TableParser(),
    new SequenceParser(),
    new ViewParser(),
    new ConstraintParser(),
    new IndexParser(),
  ] as const satisfies readonly BaseParser[];;

  parse(content: string): ParsedResult {
    const objects: DatabaseObject[] = [];
    const attachableStatements: AttachableParsedStatement[] = [];
    const residual: string[] = [];

    const statements = Parser.splitIntoStatements(content);

    for (const statement of statements) {
      const trimmed = statement.trim();

      if (!trimmed) {
        continue;
      }

      const parsed = Parser.parseStatement(trimmed);
      if (parsed) {
        switch (parsed.type) {
          case 'sequence':
          case 'constraint':
          case 'index':
            attachableStatements.push(parsed);
            break;
          case 'schema': // no qualifiedName
            objects.push({
              type: parsed.type,
              schema: parsed.schema,
              name: parsed.name,
              definition: parsed.definition,
            });
            break;
          default:
            objects.push({
              type: parsed.type,
              schema: parsed.schema,
              name: parsed.name,
              qualifiedName: parsed.qualifiedName,
              definition: parsed.definition,
            });
        }
        if (parsed.residual) {
          residual.push(parsed.residual);
        }
      } else {
        residual.push(statement);
      }
    }

    Parser.attachObjectsToTables(objects, attachableStatements);

    return {
      objects,
      residual: residual.join('\n').trim(),
    };
  }

  private static splitIntoStatements(
    content: string,
    separator: ';' | ',' = ';'
  ): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let pos = 0;
    const len = content.length;

    let inDashComment = false;
    let inBlockComment = false;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    while (pos < len) {
      const char = content[pos];
      const nextChar = content[pos + 1];

      // Dollar quotes have highest precedence
      if (char === '$') {
        const match = Parser.DOLLAR_QUOTE_REGEX.exec(content.slice(pos));
        if (match) {
          const dollarQuoteTag = match[0];
          const closePos = content.indexOf(dollarQuoteTag, pos + dollarQuoteTag.length);
          if (closePos !== -1) {
            currentStatement += content.slice(pos, closePos + dollarQuoteTag.length);
            pos = closePos + dollarQuoteTag.length;
          } else { // accumulate unclosed dollar quote
            currentStatement += dollarQuoteTag;
            pos += dollarQuoteTag.length;
          }
        } else {
          currentStatement += char;
          pos++;
        }
        continue;
      }

      // Handle comments and quotes
      if (!inSingleQuote && !inDoubleQuote) {
        // Check for dash comment start
        if (!inBlockComment && char === '-' && nextChar === '-') {
          inDashComment = true;
          currentStatement += '--';
          pos += 2;
          continue;
        }

        // Check for block comment start
        if (!inDashComment && char === '/' && nextChar === '*') {
          inBlockComment = true;
          currentStatement += '/*';
          pos += 2;
          continue;
        }
      }

      // Handle state transitions
      if (inDashComment) {
        if (char === '\n' || char === '\r') {
          inDashComment = false;
        }
      } else if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          currentStatement += '*/';
          pos += 2;
          continue;
        }
      } else {
        if (!inDoubleQuote && char === "'") {
          inSingleQuote = !inSingleQuote;
        } else if (!inSingleQuote && char === '"') {
          inDoubleQuote = !inDoubleQuote;
        }

        if (!inSingleQuote && !inDoubleQuote) {
          if (char === separator) {
            currentStatement += char;
            statements.push(currentStatement);
            currentStatement = '';
            pos++;
            continue;
          }
        }
      }

      currentStatement += char;
      pos++;
    }

    if (currentStatement) {
      statements.push(currentStatement);
    }

    return statements;
  }

  private static parseStatement(statement: string): ParsedStatement | undefined {
    for (const parser of Parser.PARSER_REGISTRY) {
      const match = parser.regex.exec(statement);
      if (match) {
        return parser.parse(match, statement);
      }
    }
  }

  private static attachObjectsToTables(
    objects: DatabaseObject[],
    attachableStatements: AttachableParsedStatement[]
  ): void {

    const attachablesByTable = Parser.groupAttachablesByTable(attachableStatements);

    for (const object of objects) {
      if (object.type === 'table' || object.type == 'view') {
        const qualifiedTable = makeQualifiedName(object.schema, object.name);
        const tableAttachables = attachablesByTable[qualifiedTable];

        if (!tableAttachables) continue;

        if (tableAttachables.sequences.length > 0) {
          object.sequences = tableAttachables.sequences.map((seq) => seq.definition);
          object.definition =
            Parser.attachSequencesToTable(object.definition, tableAttachables.sequences);
        }

        if (tableAttachables.constraints.length > 0) {
          object.constraints =
            tableAttachables.constraints.map((constraint) => constraint.definition);
          object.definition =
            Parser.attachConstraintsToTable(object.definition, tableAttachables.constraints);
        }

        if (tableAttachables.indexes.length > 0) {
          const indexDefinitions = tableAttachables.indexes.map((index) => index.definition);
          object.indexes = indexDefinitions;
          object.definition += '\n\n' + indexDefinitions.join('\n');
        }
      }
    }
  }

  private static groupAttachablesByTable(
    attachableStatements: AttachableParsedStatement[]
  ): AttachablesByTable {
    return attachableStatements.reduce(
      (acc, statement) => {
        const qualifiedTable = makeQualifiedName(statement.schema, statement.table);

        if (!acc[qualifiedTable]) {
          acc[qualifiedTable] = { sequences: [], constraints: [], indexes: [] };
        }

        switch (statement.type) {
          case 'sequence':
            acc[qualifiedTable].sequences.push(statement);
            break;
          case 'constraint':
            acc[qualifiedTable].constraints.push(statement);
            break;
          case 'index':
            acc[qualifiedTable].indexes.push(statement);
            break;
        }

        return acc;
      },
      {} as AttachablesByTable
    );
  }

  private static attachSequencesToTable(
    tableDefinition: string,
    sequences: SequenceParsedStatement[]
  ): string {

    let modifiedContent = tableDefinition;

    for (const sequence of sequences) {
      const columnDefinition = Parser.findTableColumnDefinition(modifiedContent, sequence.column);
      if (!columnDefinition) {
        continue;
      }

      let columnDefinitionEndPos = columnDefinition.endPos;
      const notNullMatch = /\s+(?:NOT\s+)?NULL\s*$/i.exec(columnDefinition.definition);
      if (notNullMatch) {
        columnDefinitionEndPos -= columnDefinition.definition.length - notNullMatch.index; // insert the sequence definition before the [NOT] NULL
      }

      const sequenceHeaderMatch = Parser.SEQUENCE_HEADER_REGEX.exec(sequence.definition);
      if (!sequenceHeaderMatch) {
        continue;
      }

      const sequenceDefinition = sequence.definition.slice(
        sequenceHeaderMatch.index + sequenceHeaderMatch[0].length
      ).replace(/\s*;\s*$/, '')                               // remove terminating semicolon
        .replace(/\s{2,}|\n+/g, ' ')                          // collapse line breaks and indents onto a single line
        .replace(/(\(\s+|\s+\))+/g, (match) => match.trim()); // remove whitespace inside brackets

      modifiedContent = modifiedContent.slice(0, columnDefinitionEndPos) + ' '
        + sequenceDefinition + modifiedContent.slice(columnDefinitionEndPos);
    }

    return modifiedContent;
  }

  private static attachConstraintsToTable(
    tableDefinition: string,
    constraints: ParsedStatement[]
  ): string {

    const lastParenIndex = tableDefinition.lastIndexOf(')', tableDefinition.lastIndexOf(';'));

    let modifiedContent = tableDefinition;

    if (lastParenIndex !== -1) {
      const constraintDefinitions: string[] = [];
      for (const constraint of constraints) {
        const constraintMatch = Parser.CONSTRAINT_DEFINITION_REGEX.exec(constraint.definition);
        if (constraintMatch) {
          constraintDefinitions.push(`CONSTRAINT ${constraintMatch[1]} ${constraintMatch[2]}`);
        } else {
          constraintDefinitions.push(constraint.definition);
        }
      }

      if (constraintDefinitions.length) {
        let lastContentIndex = lastParenIndex - 1;
        while (lastContentIndex >= 0 && /\s/.test(tableDefinition[lastContentIndex])) {
          lastContentIndex--;
        }

        const indentedSeparator = `,\n${Parser.detectIndent(tableDefinition).indent}`;
        const constraintText = indentedSeparator + constraintDefinitions.join(indentedSeparator);
        modifiedContent = tableDefinition.slice(0, lastContentIndex + 1)
          + `${constraintText}\n${tableDefinition.slice(lastParenIndex)}`;
      }
    }

    return modifiedContent;
  }

  private static findTableColumnDefinition(
    tableDefinition: string,
    column: string
  ): { definition: string; startPos: number; endPos: number } | undefined {

    const tableHeaderMatch = Parser.TABLE_HEADER_REGEX.exec(tableDefinition);

    if (!tableHeaderMatch) {
      return;
    }

    const firstParenIndex = tableHeaderMatch.index + tableHeaderMatch[0].length;
    const lastParenIndex = tableDefinition.lastIndexOf(')', tableDefinition.lastIndexOf(';'));

    if (lastParenIndex === -1) {
      return;
    }

    const tableContents = tableDefinition.slice(firstParenIndex + 1, lastParenIndex);
    const statements = Parser.splitIntoStatements(tableContents, ',');

    const columnRegex = Parser.getTableColumnRegex(column);

    const columnStatementIndex = statements.findIndex((statement) => columnRegex.test(statement));

    if (columnStatementIndex === -1) {
      return;
    }

    let definition = statements[columnStatementIndex].replace(/[,\s]+$/, ''); // remove trailing comma or \n
    const definitionLength = definition.length;

    let startPos = firstParenIndex + 1;

    if (columnStatementIndex > 0) {
      for (let i = 0; i < columnStatementIndex; ++i) {
        startPos += statements[i].length;
      }
    }

    const endPos = startPos + definitionLength;

    definition = definition.trimStart();
    if (definition.length !== definitionLength) {
      startPos += definitionLength - definition.length;
    }

    return { definition, startPos, endPos };
  }

  private static getTableColumnRegex(column: string): RegExp {
    const pattern = '^\\s*'
      + column.replace(
        Parser.UNSAFE_REGEX_CHARACTERS_REGEX,
        Parser.UNSAFE_REGEX_CHARACTERS_REPLACEMENT
      )
      + '\\s+';

    let regex = Parser.TABLE_COLUMN_REGEX_CACHE.get(pattern);
    if (!regex) {
      regex = new RegExp(pattern);
      Parser.TABLE_COLUMN_REGEX_CACHE.set(pattern, regex);
    }

    return regex;
  }

  private static detectIndent(string: string) {
    const indents = string
      .split('\n')
      .map((line) => ((/^[ \t]*/.exec(line)) ?? [''])[0])
      .filter((ws) => ws.length > 0);

    if (indents.length === 0) {
      return { type: 'space', amount: 0, indent: '' };
    }

    const freq: Record<string, number> = {};
    indents.forEach((ws) => {
      freq[ws] = (freq[ws] || 0) + 1;
    });

    const [mostUsedIndent, mostUsedCount] = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)[0];

    if (mostUsedCount > indents.length / 2) { // If the most common indent accounts for >50% of indented lines, trust it
      const char = mostUsedIndent.startsWith('\t') ? 'tab' : 'space';
      return {
        type: char,
        amount: mostUsedIndent.length,
        indent: mostUsedIndent,
      };
    }

    function gcd(a: number, b: number): number { // Calculates a "Greatest Common Divisor", the largest positive integer that divides two (or more) integers without leaving a remainder
      return b === 0 ? a : gcd(b, a % b);
    }

    const spaceCounts = indents
      .filter((ws) => ws.startsWith(' '))
      .map((ws) => ws.length);

    if (spaceCounts.length > 0) {
      const unit = spaceCounts.reduce(gcd);
      return {
        type: 'space',
        amount: unit,
        indent: ' '.repeat(unit),
      };
    }

    const tabCounts = indents
      .filter((ws) => ws.startsWith('\t'))
      .map((ws) => ws.length);

    const unit = tabCounts.reduce(gcd);
    return {
      type: 'tab',
      amount: unit,
      indent: '\t'.repeat(unit),
    };
  }
}
