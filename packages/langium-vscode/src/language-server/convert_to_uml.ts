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

            syncWriteFile('UML.pu','@startuml UML\n',true);
            const parsedUri = URI.parse(uri);
            const document = documents.getOrCreateDocument(parsedUri);
            if (document.diagnostics?.some(e => e.severity === DiagnosticSeverity.Error)) {
                return undefined;
            }

            const grammar = document.parseResult.value as Grammar;
            const importedGrammars = resolveTransitiveImports(documents, grammar);
            const rules = grammar.rules;
            rules.forEach(rule => {
                // ParseArg(rule);
                // ParseLink(rule);
                TransitiveFun(rule);
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
    // function ParseLink(rule: GrammarAST.AbstractRule) {
    //     if( isParserRule(rule)){
    //         const source = rule.name;
    //         if (isAlternatives(rule.definition)){
    //             for (const elem of rule.definition.elements ){
    //                 if (isAssignment(elem)){
    //                     const dest = elem.feature;
    //                     if (isRuleCall(elem.terminal)){
    //                         const symb = ' *-->';
    //                         syncWriteFile('UML.pu',source + symb + dest +': ' + elem.terminal.rule.$refText+ ' "' + elem.cardinality + '"' + '\n',false);
    //                     }
    //                 }else{
    //                     console.log('#####################################', elem);
    //                 }
    //             }
    //         }
    //         if(isGroup(rule.definition)){
    //             for(const elem in rule.definition.elements){
    //                 if(isAssignment(elem)){
    //                     if(isCrossReference(elem.terminal)){
    //                         const refer = elem.terminal.type.$refText;
    //                         const symb = ' *-->';
    //                         syncWriteFile('UML.pu',source + symb + refer +': ' + ' "' + elem.cardinality + '"' + '\n',false);
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // }
    // function ParseArg(rule: GrammarAST.AbstractRule) {
    //     if( isParserRule(rule)){
    //         const msg = '\nclass ' + rule.name.toString() + ' { ' + '\n';
    //         syncWriteFile('UML.pu',msg,false);
    //         ExploreClass(rule);
    //         syncWriteFile('UML.pu','}\n',false);
    //     }
    // }
    // function ExploreClass(rule: GrammarAST.AbstractRule) {
    //     if (isGroup(rule.definition)){
    //         GroupExplorer(rule.definition);
    //     }
    // }
    // function GroupExplorer(rule: GrammarAST.Group){
    //     let op = '';
    //     let type= '';
    //     let names = '';
    //     let feat = '';
    //     for (const elem of rule.elements ){
    //         if (isKeyword(elem)){names = elem.value;}
    //         if (isAssignment(elem)){op = elem.operator;
    //             if (isRuleCall(elem.terminal)){type = elem.terminal.rule.$refText;}
    //             // if(isFeatureName)
    //             if (elem.feature !== null){feat = elem.feature; syncWriteFile('UML.pu',feat + op + type,false);}
    //             else {syncWriteFile('UML.pu',names + op + type,false);}}
    //     }
    //     syncWriteFile('UML.pu','\n',false);
    // }
    function AssignRuCa(rule: GrammarAST.Assignment) {
        const pathRuCa = rule. terminal;
        if(isRuleCall(pathRuCa)) {
            if(isTerminalRule(pathRuCa.rule.ref)){
                const pathTeRu = pathRuCa.rule.ref;
                isTerminalRule(pathTeRu);
                syncWriteFile('UML.pu',rule.feature,false);
                syncWriteFile('UML.pu',rule.operator,false);
                syncWriteFile('UML.pu',pathTeRu.name,false);
                if(isRegexToken(pathTeRu.definition)){
                    syncWriteFile('UML.pu', '\n',false);
                    //inutile pour l'instant
                }
            }
            if(isParserRule(pathRuCa.rule.ref)){
                const pathPaRu = pathRuCa.rule.ref;
                // syncWriteFile('UML.pu',rule.feature,false);
                // syncWriteFile('UML.pu',rule.operator,false);
                // syncWriteFile('UML.pu',pathPaRu.name,false);
                //mal filtré
                if(isAssignment(pathPaRu.definition))
                    console.log('########boucler sur la fonction de link##########', pathPaRu.definition);
            }
        }
    }

    function AssignCR(rule: GrammarAST.CrossReference) {
        const pathCrRe = rule;
        if(isRuleCall(pathCrRe.terminal)){
            const pathRuCa = pathCrRe.terminal;
            syncWriteFile('UML.pu',pathRuCa.rule.$refText,false);
            if(isTerminalRule(pathRuCa.rule.ref)){
                const pathTeRu = pathRuCa.rule.ref;
                if(isRegexToken(pathTeRu.definition)){
                    // pas utilisé
                }
            }
            if(isParserRule(pathRuCa.rule)){
                // const pathPaRu = pathRuCa.rule;
                syncWriteFile('UML.pu', '\n',false);
                //call à une fonction de formatage
            }
        }
        if(isTerminalRule(pathCrRe.type)){
            const pathTeRu = pathCrRe.type;
            if(isRegexToken(pathTeRu.definition)){
                syncWriteFile('UML.pu', '\n',false);
            }
        }
    }

    function TransitiveFun(rule: GrammarAST.AbstractRule) {
        if( isParserRule(rule)){
            syncWriteFile('UML.pu', 'class ' + rule.name +  '{\n',false);
            if(isAlternatives(rule.definition) || isGroup(rule.definition)){
                const pathAlt = rule.definition;
                for(const elem in pathAlt.elements){
                    if (isKeyword(pathAlt.elements[elem])){
                        const pathKw = pathAlt.elements[elem];
                        if(isKeyword(pathKw)){
                            // syncWriteFile('UML.pu',pathKw.value,false);
                        }
                    }
                    else{
                        if(isAssignment(pathAlt.elements[elem])){
                            const pathAsign = pathAlt.elements[elem];
                            if(isAssignment(pathAsign)){
                                if(isRuleCall(pathAsign.terminal)){
                                    AssignRuCa(pathAsign);
                                }
                                if(isCrossReference(pathAsign.terminal)){
                                    AssignCR(pathAsign.terminal);
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
}