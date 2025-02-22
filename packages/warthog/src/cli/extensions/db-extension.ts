import * as childProcess from 'child_process';

import { GluegunToolbox } from 'gluegun';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
import * as pgtools from 'pgtools';
import * as util from 'util';
import { Toolbox } from 'gluegun/build/types/domain/toolbox';

const exec = util.promisify(childProcess.exec);

module.exports = (toolbox: GluegunToolbox) => {
  const {
    config: { load },
    print: { error, info },
  } = toolbox;

  toolbox.db = {
    create: async function create(database: string): Promise<boolean> {
      if (!database) {
        error('Database name is required');
        return false;
      }

      const config = load();
      const createDb = util.promisify(pgtools.createdb) as Function;

      try {
        await createDb(getPgConfig(config), database);
      } catch (e: any) {
        if (e.message.indexOf('duplicate') > -1) {
          info(`Database '${database}' already exists`);
          return true;
        }
        error(e.message);
        return false;
      }
      info(`Database '${database}' created!`);
      return true;
    },
    drop: async function drop(): Promise<boolean> {
      const config = load();
      const database = config.get('DB_DATABASE');
      const dropDb = util.promisify(pgtools.dropdb) as Function;

      try {
        await dropDb(getPgConfig(config), database);
      } catch (e: any) {
        if (e.name.indexOf('invalid_catalog_name') > -1) {
          info(`Database '${database}' does not exist`);
          return true;
        }
        error(e.message);
        return false;
      }
      info(`Database '${database}' dropped!`);
      return true;
    },
    migrate: async function migrate() {
      load();

      const result = await runTypeORMCommand('migration:run', toolbox);

      // If we don't run the command because of some other error, just return the error
      if (typeof result === 'string') {
        return error(result);
      }
      if (result.stderr) {
        return error(result.stderr);
      } else {
        return info(result.stdout);
      }
    },
    generateMigration: async function generateMigration(name: string) {
      load();

      // Set name to pascal case so that migration class names are pascaled (eslint)
      name = toolbox.strings.pascalCase(name);

      const result = await runTypeORMCommand(
        `migration:generate -n ${name}`,
        toolbox,
        `--dir ./${process.env.WARTHOG_DB_MIGRATIONS_DIR}`
      );

      // If we don't run the command because of some other error, just return the error
      if (typeof result === 'string') {
        return error(result);
      }
      if (result.stderr) {
        return error(result.stderr);
      } else {
        return info(result.stdout);
      }
    },
  };
};

async function runTypeORMCommand(command: string, toolbox: Toolbox, additionalParams = '') {
  const tsNodePath = path.join(process.cwd(), './node_modules/.bin/ts-node');
  const typeORMPath = path.join(process.cwd(), './node_modules/.bin/typeorm');
  const ormConfigFullPath = path.join(String(process.env.WARTHOG_GENERATED_FOLDER), 'ormconfig.ts');
  const relativeOrmConfigPath = path.relative(process.cwd(), ormConfigFullPath);

  if (toolbox.filesystem.isNotFile(ormConfigFullPath)) {
    return `Cannot find ormconfig path: ${ormConfigFullPath}`;
  }

  // Ok running this command from within the CLI is finicky
  //
  // 1. For some reason, this command does not work unless you force the --dir in, too.
  //    See https://github.com/typeorm/typeorm/blob/master/src/commands/MigrationGenerateCommand.ts#L52
  //    If you don't pass --dir, then it creates the connectionOptionsReader twice, and for some reason after the first time
  //    it drops settings (specifically the namingStrategy)
  //
  // 2. We need to make sure that all TYPEORM_ environment variables are pulled out of process.env so that
  //    TypeORM doesn't skip loading the ormconfig file
  const cmd = `${tsNodePath} ${typeORMPath} ${command}  --config ${relativeOrmConfigPath} ${additionalParams}`;

  const filteredEnv = filteredProcessEnv();
  return await exec(cmd, { env: filteredEnv });
}

function filteredProcessEnv() {
  const raw = process.env;
  return Object.keys(raw)
    .filter((key) => !key.startsWith('TYPEORM_'))
    .reduce((obj: any, key) => {
      obj[key] = raw[key];
      return obj;
    }, {});
}

function getPgConfig(config: any) {
  return {
    host: config.get('DB_HOST'),
    user: config.get('DB_USERNAME'),
    password: config.get('DB_PASSWORD'),
    port: config.get('DB_PORT'),
  };
}

function validateDevNodeEnv(env: string, action: string) {
  if (!env) {
    return 'NODE_ENV must be set';
  }
  if (env !== 'development' && env !== 'test' && process.env.WARTHOG_DB_OVERRIDE !== 'true') {
    return `Cannot ${action} database without setting WARTHOG_DB_OVERRIDE environment variable to 'true'`;
  }
  return '';
}
