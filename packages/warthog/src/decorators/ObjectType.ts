// eslint-disable-line @typescript-eslint/no-var-requires
import * as path from 'path';
import { ObjectType as TypeGraphQLObjectType } from 'type-graphql';
import { ObjectOptions } from 'type-graphql/dist/decorators/ObjectType.d';

import { ClassType } from '../core';
import { getMetadataStorage } from '../metadata';
import { ClassDecoratorFactory, composeClassDecorators, generatedFolderPath } from '../utils/';
const caller = require('caller');

// Allow default TypeORM and TypeGraphQL options to be used
// export function Model({ api = {}, db = {}, apiOnly = false, dbOnly = false }: ModelOptions = {}) {
export function ObjectType(options: ObjectOptions = {}) {
  // In order to use the enums in the generated classes file, we need to
  // save their locations and import them in the generated file
  const modelFileName = caller();

  // Use relative paths when linking source files so that we can check the generated code in
  // and it will work in any directory structure
  const relativeFilePath = path.relative(generatedFolderPath(), modelFileName);

  const registerModelWithWarthog = (target: ClassType): void => {
    // Save off where the model is located so that we can import it in the generated classes
    getMetadataStorage().addClass(target.name, target, relativeFilePath);
  };

  const factories: any[] = [];

  // We add our own Warthog decorator regardless of dbOnly and apiOnly
  factories.push(registerModelWithWarthog as ClassDecoratorFactory);

  // We shouldn't add this as it creates the GraphQL type, but there is a
  // bug if we don't add it because we end up adding the Field decorators in the models
  factories.push(TypeGraphQLObjectType(options as ObjectOptions) as ClassDecoratorFactory);

  return composeClassDecorators(...factories);
}
