/******************************************************************************
 * Copyright 2021 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { LangiumSharedServices, Module, PartialLangiumSharedServices } from 'langium';
import { createLangiumGrammarServices, startLanguageServer } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { LangiumGrammarWorkspaceManager } from './grammar-workspace-manager.js';
//import { registerRailroadConnectionHandler } from './railroad-handler.js';  //permet de rebrancher sur le railroad original de Langium
import { registerUML } from './convert_to_uml.js';

const connection = createConnection(ProposedFeatures.all);

export const LangiumGrammarSharedModule: Module<LangiumSharedServices, PartialLangiumSharedServices> = {
    workspace: {
        WorkspaceManager: (services) => new LangiumGrammarWorkspaceManager(services)
    }
};

const { shared, grammar } = createLangiumGrammarServices({ connection, ...NodeFileSystem }, LangiumGrammarSharedModule);
//registerRailroadConnectionHandler(connection, grammar); //permet de rebrancher sur le railroad original de Langium
registerUML(connection, grammar);
startLanguageServer(shared);
