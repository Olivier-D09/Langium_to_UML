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
import {isAlternatives, isAssignment, isCrossReference, isParserRule, isRegexToken, isRuleCall, isTerminalRule, isGroup, isKeyword} from '../../../langium/src/grammar/generated/ast.js';

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

            syncWriteFile('UML.pu','@startuml UML\n \n',true);
            const parsedUri = URI.parse(uri);
            const document = documents.getOrCreateDocument(parsedUri);
            if (document.diagnostics?.some(e => e.severity === DiagnosticSeverity.Error)) {
                return undefined;
            }

            const grammar = document.parseResult.value as Grammar;
            const importedGrammars = resolveTransitiveImports(documents, grammar);
            const rules = grammar.rules;
            rules.forEach(rule => {
                MakeClass(rule); // make class & arg of class
                MakeLink(rule);

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
    function AssignRuleCall(rule: GrammarAST.Assignment) {
        const pathRuleCall = rule.terminal;
        if(isRuleCall(pathRuleCall)) {
            if(isTerminalRule(pathRuleCall.rule.ref)){
                const pathTerminalRule = pathRuleCall.rule.ref;
                isTerminalRule(pathTerminalRule);
                syncWriteFile('UML.pu',rule.feature + rule.operator + pathTerminalRule.name,false);
                if(isRegexToken(pathTerminalRule.definition)){
                    //inutile pour l'instant
                }
            }
        }
    }

    function AssignCrossReference(rule: GrammarAST.CrossReference) {
        const pathCrossRef = rule;
        if(isRuleCall(pathCrossRef.terminal)){
            const pathRuleCall = pathCrossRef.terminal;
            if(isTerminalRule(pathRuleCall.rule.ref)){
                const pathTerminalRule = pathRuleCall.rule.ref;
                if(isRegexToken(pathTerminalRule.definition)){
                    // pas utilisé
                }
            }
            if(isParserRule(pathRuleCall.rule)){
                // const pathParserRule = pathRuleCall.rule;
                //call à une fonction de formatage
            }
        }
        if(isTerminalRule(pathCrossRef.type)){
            const pathTerminalRule = pathCrossRef.type;
            if(isRegexToken(pathTerminalRule.definition)){
                syncWriteFile('UML.pu', '\n',false);
            }
        }
    }

    function MakeClass(rule: GrammarAST.AbstractRule) {
        if( isParserRule(rule)){
            syncWriteFile('UML.pu', 'class ' + rule.name +  '{\n',false);
            if(isAlternatives(rule.definition) || isGroup(rule.definition)){
                const pathAlternative = rule.definition;
                for(const elem in pathAlternative.elements){
                    if (isKeyword(pathAlternative.elements[elem])){
                        const pathKeyword = pathAlternative.elements[elem];
                        if(isKeyword(pathKeyword)){
                            // syncWriteFile('UML.pu',pathKeyword.value,false);
                        }
                    }
                    else{
                        if(isAssignment(pathAlternative.elements[elem])){
                            const pathAsign = pathAlternative.elements[elem];
                            if(isAssignment(pathAsign)){
                                if(isRuleCall(pathAsign.terminal)){
                                    AssignRuleCall(pathAsign);
                                }
                                if(isCrossReference(pathAsign.terminal)){
                                    AssignCrossReference(pathAsign.terminal);
                                }
                                if(isParserRule(pathAsign.terminal)){
                                    //call à une fonction de formatage
                                }
                            }
                        }
                    }
                }
            }
            syncWriteFile('UML.pu', '\n}\n',false);
        }
    }

    function LinkRuleCall(rule: GrammarAST.Assignment) {
        isAssignment(rule);
        let cardinal = '';
        let destName = '';
        if(rule.cardinality !== undefined) {
            cardinal = rule.cardinality;
        }
        if(isParserRule(rule.$container?.$container)) {
            destName = rule.$container.$container.name;
        }
        const pathRuleCall = rule.terminal;
        if(isRuleCall(pathRuleCall)) {
            if(isParserRule(pathRuleCall.rule.ref)){
                const pathParserRule = pathRuleCall.rule.ref;
                syncWriteFile('UML.pu',pathParserRule.name + ' ',false);
                if(cardinal !== ''){
                    syncWriteFile('UML.pu','"' + cardinal + '" ',false);
                }
                syncWriteFile('UML.pu','*-- ' +'"' + rule.feature + '" ' + destName + '\n',false);
            }
        }
        if(isCrossReference(pathRuleCall)) {
            const pathCrossRef = pathRuleCall;
            if(isRuleCall(pathCrossRef.terminal)){
                const pathRuleCall = pathCrossRef.terminal;
                if(isParserRule(pathRuleCall.rule.ref)){
                    const pathParserRule = pathRuleCall.rule.ref;
                    syncWriteFile('UML.pu',pathParserRule.name + ' ',false);
                    if(cardinal !== ''){
                        syncWriteFile('UML.pu','"' + cardinal + '" ',false);
                    }
                    syncWriteFile('UML.pu','*-- ' +'"' + rule.feature + '" ' + destName + '\n',false);
                }
            }
        }
    }

    function MakeLink(rule: GrammarAST.AbstractRule){
        if( isParserRule(rule)){
            if(isAlternatives(rule.definition) || isGroup(rule.definition)){
                const pathAlternative = rule.definition;
                for(const elem in pathAlternative.elements){
                    // if (isKeyword(pathAlternative.elements[elem])){
                    //     const pathKeyword = pathAlternative.elements[elem];
                    //     if(isKeyword(pathKeyword)){
                    //         // syncWriteFile('UML.pu',pathKeyword.value,false);
                    //     }
                    // }
                    if(isAssignment(pathAlternative.elements[elem])){
                        const pathAsign = pathAlternative.elements[elem];
                        if(isAssignment(pathAsign)){
                            if(isRuleCall(pathAsign.terminal)){
                                LinkRuleCall(pathAsign);
                            }
                            if(isCrossReference(pathAsign.terminal)){
                                AssignCrossReference(pathAsign.terminal);
                            }
                            if(isParserRule(pathAsign.terminal)){
                                //call à une fonction de formatage
                            }
                        }
                    }
                }
            }
            syncWriteFile('UML.pu', '\n',false);
        }
    }
}