/******************************************************************************
 * Copyright 2023 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Grammar, LangiumServices } from 'langium';
import { DocumentState, GrammarAST, URI, expandToString } from 'langium';
import type { Connection} from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { DOCUMENTS_VALIDATED_NOTIFICATION, RAILROAD_DIAGRAM_REQUEST } from './messages.js';
import { createGrammarDiagramHtml } from 'langium-railroad';
import { resolveTransitiveImports } from 'langium/internal';
import { isParserRule } from '../../../langium/src/grammar/generated/ast.js';

export function registerUML(connection: Connection, services: LangiumServices): void {
    const documentBuilder = services.shared.workspace.DocumentBuilder;
    const documents = services.shared.workspace.LangiumDocuments;
    documentBuilder.onBuildPhase(DocumentState.Validated, documents => {
        const uris = documents.map(e => e.uri.toString());
        connection.sendNotification(DOCUMENTS_VALIDATED_NOTIFICATION, uris);
    });
    // After receiving the `DOCUMENTS_VALIDATED_NOTIFICATION`
    // the vscode extension will perform the following request
    connection.onRequest(RAILROAD_DIAGRAM_REQUEST, (uri: string) => {
        try {

            syncWriteFile('UML.pu','@startuml \n',true);
            const parsedUri = URI.parse(uri);
            const document = documents.getOrCreateDocument(parsedUri);
            if (document.diagnostics?.some(e => e.severity === DiagnosticSeverity.Error)) {
                return undefined;
            }

            const grammar = document.parseResult.value as Grammar;
            const importedGrammars = resolveTransitiveImports(documents, grammar);
            const rules = grammar.rules;
            console.log('rules', rules.map(e => e.name));
            rules.forEach(rule => {
                console.log('rule', rule.name);
                const msg = 'class ' + rule.name.toString() + ' { ' + '\n' + '}' + '\n';
                if( isParserRule(rule)){
                    syncWriteFile('UML.pu',msg,false);
                    console.log ('full ',(rule));
                    console.log ('def',(rule.definition));
                }
            });
            // Map all local and imported parser rules into a single array
            const parserRules = [grammar, ...importedGrammars].flatMap(g => g.rules).filter(GrammarAST.isParserRule);
            const generatedRailroadHtml = createGrammarDiagramHtml(Array.from(parserRules), {
                // Setting the state to the current uri allows us to open the webview on vscode restart
                javascript: expandToString`
                    const vscode = acquireVsCodeApi();
                    vscode.setState(${JSON.stringify(uri)});
                `
            });
            return generatedRailroadHtml;
        } catch {
            // Document couldn't be found or uri was invalid, just return nothing
            return undefined;
        }
    });
    function syncWriteFile(filename: string, data: string,stat: boolean) {
        /**
         * flags:
         *  - w = Open file for reading and writing. File is created if not exists
         *  - a+ = Open file for reading and appending. The file is created if not exists
         */
        if (stat === true) {
            writeFileSync(join(__dirname, filename), data, {
                flag: 'w',
            });
        }
        else {
            writeFileSync(join(__dirname, filename), data, {
                flag: 'a+',
            });
        }
        const contents = readFileSync(join(__dirname, filename), 'utf-8');
        return contents;
    }
}
