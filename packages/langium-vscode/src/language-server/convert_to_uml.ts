/******************************************************************************
 * Copyright 2023 Université Cote d'Azur
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {Grammar, LangiumServices } from 'langium';
import { DocumentState, GrammarAST, URI, expandToString} from 'langium';
import type { Connection} from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { DOCUMENTS_VALIDATED_NOTIFICATION, RAILROAD_DIAGRAM_REQUEST } from './messages.js';
import { createGrammarDiagramHtml } from 'langium-railroad';
import { resolveTransitiveImports } from 'langium/internal';
import {isAlternatives, isAssignment, isCrossReference, isParserRule, isRegexToken, isRuleCall, isTerminalRule, isGroup, isKeyword, isAction, isInferredType} from '../../../langium/src/grammar/generated/ast.js';
//import plantuml from 'node-plantuml/node_modules/commander';

import {exportUml} from './exportUml.js';

//import type { GeneratorContext} from 'langium-sprotty';
//import { LangiumDiagramGenerator } from 'langium-sprotty';
//import type { SModelRoot } from 'sprotty-protocol';

export function registerUML(connection: Connection, services: LangiumServices): void {
    const fileName = 'arithmetic' + '.pu' ;

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

            syncWriteFile(fileName,'@startuml \n \n',true);
            const parsedUri = URI.parse(uri);
            const document = documents.getOrCreateDocument(parsedUri);
            if (document.diagnostics?.some(e => e.severity === DiagnosticSeverity.Error)) {
                return undefined;
            }

            const grammar = document.parseResult.value as Grammar;
            const importedGrammars = resolveTransitiveImports(documents, grammar);
            const rules = grammar.rules;
            rules.forEach(rule => {
                makeClass(rule); // make class & arg of class
                makeLink(rule); // make link between class
            });
            syncWriteFile(fileName,'@enduml',false);

            // Generate the diagram
            try {
                exportUml(__dirname+'\\',fileName);
                //const gen = plantuml.generate(fileName);
                //console.log(gen);
                //gen.out.pip(createWriteStream('UML.png'));

            }catch (e){
                console.log(e);
            }

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

    /**
     * Ecrit dans un fichier le contenu passé en paramètre et décide si l'on écrase le précédent fichier
     * @param filename nom du fichier
     * @param data contenu à écrire
     * @param stat true si le fichier doit être écrasé, false si il doit être complété
     */
    function syncWriteFile(filename: string, data: string,stat: boolean) {
        /**
         * flags:
         *  - w = Open file for reading and writing. File is created if not exists
         *  - a+ = Open file for reading and appending. The file is created if not exists
         */
        if (stat === true) {
            writeFileSync(join(__dirname, filename), data, {
                flag: 'w', // w = Open file for reading and writing. Erase if exist and create if not exists
            });
        }
        else {
            writeFileSync(join(__dirname, filename), data, {
                flag: 'a+', // a+ = Open file for reading and appending. The file is created if not exists
            });
        }
        const contents = readFileSync(join(__dirname, filename), 'utf-8');
        return contents;
    }

    /**
     * Trouve le nom du parent d'un sous arbre
     * @param rule contiens le sous arbre dont le parent doit être trouvé
     * @returns le nom du parent du sous arbre
     */
    function recursiveFindParentName(rule: GrammarAST.ParserRule | GrammarAST.Assignment | GrammarAST.Group | GrammarAST.AbstractElement){
        if(isParserRule(rule)){
            const pathParserRule = rule;
            if(isParserRule(pathParserRule)){
                const parentName = pathParserRule.name; // nom de la classe source
                return parentName;
            }
        }
        else {
            return recursiveFindParentName(rule.$container as GrammarAST.Group); // récursion pour remonter l'arbre
        }
        return '';
    }

    function findGroup(rule: GrammarAST.Group | GrammarAST.Alternatives | GrammarAST.AbstractElement){
        if(isGroup(rule)){
            return rule;
        }
        if(isParserRule(rule)){
            return undefined;
        }
        else {
            return findGroup(rule.$container as GrammarAST.Group); // récursion pour remonter l'arbre
        }
    }

    function findAssign(rule: GrammarAST.Assignment | GrammarAST.CrossReference | GrammarAST.Alternatives | GrammarAST.Group | GrammarAST.AbstractElement | GrammarAST.Action){
        if(isAssignment(rule)){
            return rule;
        }
        if(isParserRule(rule)){
            return undefined;
        }
        else {
            return findAssign(rule.$container as GrammarAST.Assignment); // récursion pour remonter l'arbre
        }
    }

    function choiceCardinality(rule: string, second: string, addOperator: string) {
        let debut = '1';
        let fin = '1';

        if(second === '+=' || rule === '+=' || addOperator === '+=') {
            debut = '1';
            fin ='*';
        }
        if(second === '?' || rule === '?' || addOperator === '?') {
            debut = '0';
        }
        if(second === '*' || rule === '*' || addOperator === '*') {
            fin ='*';
        }
        return '"' + debut + '..' + fin + '"';
    }

    function defFleche(rule: GrammarAST.Assignment | GrammarAST.CrossReference | GrammarAST.Alternatives | GrammarAST.Group | GrammarAST.AbstractElement | GrammarAST.Action | GrammarAST.ParserRule) {
        let fleche = ' *-- ';

        if(isAssignment(rule) && rule.operator === '='){
            fleche = ' o-- ' ;
            return fleche;
        }
        if(isAction(rule)){
            fleche = ' <|--- ';
            return fleche;
        }
        if(isCrossReference(rule)){
            fleche = ' --> ';
            return fleche;
        }
        return fleche;
    }
    /**
     * Définit la cardinalité d'un sous arbre
     * @param rule contiens le sous arbre dont la cardinalité doit être extraite
     * @returns la cardinalité du sous arbre
     */
    function defCardinality(rule: GrammarAST.Assignment | GrammarAST.CrossReference | GrammarAST.Alternatives | GrammarAST.Group | GrammarAST.AbstractElement | GrammarAST.Action) {
        let cardinal = '"1..1"';
        let first = '';
        let second = '';
        let addOperator = '';
        const pathGroup = findGroup(rule);
        const pathAssignement = findAssign(rule);

        if(isAssignment(rule) && rule.cardinality === undefined){
            first = rule.operator;
        }
        if(pathAssignement !== undefined){
            if(pathAssignement.cardinality !== undefined){
                second = pathAssignement.cardinality;
            }
            if(pathAssignement.operator === '+=') {
                if(pathAssignement.operator !== first){
                    addOperator = pathAssignement.operator;
                }
                cardinal ='"1..*"';
            }
        }
        if(pathGroup !== undefined){
            if(pathGroup.cardinality !== undefined){
                if (pathGroup.cardinality !== first){
                    second = pathGroup.cardinality;
                }
            }
        }

        if(first !== undefined && pathGroup !== undefined && pathAssignement !== undefined){
            cardinal = choiceCardinality(first,second,addOperator);
            return cardinal;
        }
        return cardinal;
    }

    // function defSign(rule: GrammarAST.Assignment | GrammarAST.CrossReference | GrammarAST.Alternatives) {    }

    /**
     * Définit le contenu d'un sous arbre RuleCall
     * @param rule contiens le sous arbre dont le contenu doit être traité
     */
    function assignRuleCall(rule: GrammarAST.Assignment) {
        const pathRuleCall = rule.terminal;
        if(isRuleCall(pathRuleCall)) {
            if(isTerminalRule(pathRuleCall.rule.ref)){
                const pathTerminalRule = pathRuleCall.rule.ref;
                isTerminalRule(pathTerminalRule);
                syncWriteFile(fileName,rule.feature + rule.operator + pathTerminalRule.name + '\n',false);
                if(isRegexToken(pathTerminalRule.definition)){
                    //inutile pour l'instant
                }
            }
        }
    }

    /**
     * Définit le contenu d'un sous arbre CrossReference
     * @param rule contiens le sous arbre dont le contenu doit être traité
     */
    function assignCrossReference(rule: GrammarAST.CrossReference) {
        const pathCrossRef = rule;
        if(isRuleCall(pathCrossRef.terminal)){
            const pathRuleCall = pathCrossRef.terminal;
            if(isTerminalRule(pathRuleCall.rule.ref)){
                const pathTerminalRule = pathRuleCall.rule.ref;
                // syncWriteFile(fileName,rule.feature + rule.operator + pathTerminalRule.name,false);
                if(isRegexToken(pathTerminalRule.definition)){
                    // pas utilisé
                }
            }
        }
    }

    /** Fonction récursive qui traite les éléments d'un groupe ou d'un alternative
     * @param rule contiens le sous arbre dont le contenu doit être traité
     */
    function groupAlternativeClass(rule: GrammarAST.Group | GrammarAST.Alternatives) {
        const pathAlternative = rule;
        for(const elem in pathAlternative.elements){
            if (isKeyword(pathAlternative.elements[elem])){
                const pathKeyword = pathAlternative.elements[elem];
                if(isKeyword(pathKeyword)){
                    if(isAssignment(pathKeyword.$container.$container)) {
                        // regarder pour cibler premier et dernier elem
                        const pathdeterminer = pathKeyword.$container.$container;
                        if(pathdeterminer.operator === '=') {
                            if(elem === '0') {
                                if(isAssignment(pathdeterminer)){
                                    syncWriteFile(fileName,pathdeterminer.feature + pathdeterminer.operator + pathKeyword.value + ',',false);
                                }
                            }
                            if(elem === (rule.elements.length-1).toString()) {
                                syncWriteFile(fileName, pathKeyword.value + ' \n',false);
                            }
                            if(elem !== '0' && elem !== (rule.elements.length-1).toString()) {
                                syncWriteFile(fileName, pathKeyword.value + ',',false);
                            }
                        }
                    }
                }
            }
            else{
                if(isAssignment(pathAlternative.elements[elem])){
                    const pathAsign = pathAlternative.elements[elem];
                    if(isAssignment(pathAsign)){
                        if(isRuleCall(pathAsign.terminal)){
                            assignRuleCall(pathAsign);
                        }
                        if(isCrossReference(pathAsign.terminal)){
                            assignCrossReference(pathAsign.terminal);
                        }
                        if(isAlternatives(pathAsign.terminal)){
                            const pathAlternative = pathAsign.terminal;
                            if(isAlternatives(pathAlternative)){
                                groupAlternativeClass(pathAlternative);
                            }
                        }
                    }
                }
                if(isGroup(pathAlternative.elements[elem])){
                    const pathGroup = pathAlternative.elements[elem];
                    if(isGroup(pathGroup)){
                        groupAlternativeClass(pathGroup);
                    }
                }
            }
        }
    }

    /**
     * Définit une classe et fait un premier tri dans l'arbre
     * @param rule contiens la règle à traiter
     */
    function makeClass(rule: GrammarAST.AbstractRule | GrammarAST.AbstractElement) {
        if(isParserRule(rule)){
            syncWriteFile(fileName, 'class ' + rule.name +  '{\n',false); // écrit le nom de la classe
            if(isAlternatives(rule.definition) || isGroup(rule.definition)){
                groupAlternativeClass(rule.definition);
            }
            if(isAssignment(rule.definition)){
                assignRuleCall(rule.definition);
            }
            syncWriteFile(fileName, '\n}\n',false); // ferme la classe
        }
    }

    /**
     * Définit les dépendences d'un sous arbre Assignement -> RuleCall
     * @param rule contiens le sous arbre dont les dépendences doivent être traitées
     */
    function linkAssignRuleCall(rule: GrammarAST.Assignment) {
        const cardinal = defCardinality(rule);
        const destName = recursiveFindParentName(rule);
        const pathRuleCall = rule.terminal;
        if(isRuleCall(pathRuleCall)) {
            if(isParserRule(pathRuleCall.rule.ref)){
                const fleche = defFleche(rule);
                const pathParserRule = pathRuleCall.rule.ref;
                syncWriteFile(fileName,destName + ' '+ cardinal + fleche +'"' + rule.feature + '" ' + pathParserRule.name + '\n',false);
            }
        }
        if(isCrossReference(pathRuleCall)) {
            const pathCrossRef = pathRuleCall;
            if(isRuleCall(pathCrossRef.terminal)){
                const pathRuleCall = pathCrossRef.terminal;
                if(isParserRule(pathRuleCall.rule.ref)){
                    const fleche = defFleche(pathCrossRef);
                    const pathParserRule = pathRuleCall.rule.ref;
                    syncWriteFile(fileName,pathParserRule.name + ' ' + cardinal + fleche +'"' + rule.feature + '" ' + destName + '\n',false);
                }
            }
        }
    }

    /**
     * traite les dépendences d'un sous arbre Alternative -> RuleCall
     * @param rule contiens le sous arbre dont les dépendences doivent être traitées
     */
    function linkAlternativeRuleCall(rule: GrammarAST.AbstractElement) {
        const pathRuleCall = rule;
        const cardinal = defCardinality(pathRuleCall);
        const destName = recursiveFindParentName(rule);
        const fleche = defFleche(rule);
        if(isRuleCall(pathRuleCall)) {
            if(isParserRule(pathRuleCall.rule.ref)){
                const pathParserRule = pathRuleCall.rule.ref;
                syncWriteFile(fileName,destName + ' ' + cardinal + fleche + pathParserRule.name + '\n',false);
            }
        }
    }

    /**
     * traite les dépendences d'un sous arbre Action
     * @param rule contiens le sous arbre dont les dépendences doivent être traitées
     */
    function linkAction(rule: GrammarAST.Action) {
        const pathAction = rule;
        const cardinal = defCardinality(pathAction);
        const destName = recursiveFindParentName(rule);
        let feature = ' "' + rule.feature + '" ' ;
        const fleche = defFleche(rule);
        if(isInferredType(pathAction.inferredType)) {
            const pathInferredType = pathAction.inferredType;
            if(rule.feature === undefined) {
                feature = '';
            }
            syncWriteFile(fileName,pathInferredType.name + ' ' + cardinal + fleche + feature +  destName + '\n',false);
        }
    }

    /**
     * traite les dépendences d'un sous arbre CrossReference
     * @param rule contiens le sous arbre dont les dépendences doivent être traitées
     */
    function linkCrossReference(rule: GrammarAST.Assignment) {
        const pathCrossRef = rule.terminal;
        const destName = recursiveFindParentName(rule);
        if(isCrossReference(pathCrossRef)){
            const cardinal = defCardinality(rule);
            if(isRuleCall(pathCrossRef.terminal)){
                const pathRuleCall = pathCrossRef.terminal;
                if(isTerminalRule(pathRuleCall.rule.ref)){
                    const fleche = defFleche(rule);
                    const pathTerminalRule = pathRuleCall.rule.ref;
                    syncWriteFile(fileName,destName  + cardinal + fleche +  '"' + rule.feature + '" ' + pathTerminalRule.name + '\n' ,false);
                }
            }
            else {
                if(isParserRule(pathCrossRef.type.ref)){
                    const pathParserRule = pathCrossRef.type.ref;
                    syncWriteFile(fileName,destName  + cardinal + ' --> ' +  '"' + rule.feature + '" ' + pathParserRule.name + '\n' ,false);
                }
            }
        }
    }

    /**
     * Fonction récursive qui traite les éléments d'un groupe ou d'un alternative
     * @param rule contiens le sous arbre dont le contenu doit être traité
     */
    function groupAlternativeLink(rule: GrammarAST.Group | GrammarAST.Alternatives) {
        const pathAlternative = rule;
        for(const elem in pathAlternative.elements){
            if(isAssignment(pathAlternative.elements[elem])){
                const pathAsign = pathAlternative.elements[elem];
                if(isAssignment(pathAsign)){
                    if(isRuleCall(pathAsign.terminal)){
                        linkAssignRuleCall(pathAsign);
                    }
                    if(isCrossReference(pathAsign.terminal)){
                        linkCrossReference(pathAsign);
                    }
                    if(isAlternatives(pathAsign.terminal)){
                        const pathAlternative = pathAsign.terminal;
                        if(isAlternatives(pathAlternative)){
                            groupAlternativeLink(pathAlternative);
                        }
                    }
                }
            }
            else {
                if(isRuleCall(pathAlternative.elements[elem])){
                    const pathRuleCall = pathAlternative.elements[elem];
                    if(isRuleCall(pathRuleCall)){
                        linkAlternativeRuleCall(pathAlternative.elements[elem]);
                    }
                }
                if(isGroup(pathAlternative.elements[elem] || isAlternatives(pathAlternative.elements[elem]))){
                    const pathGroup = pathAlternative.elements[elem];
                    if(isGroup(pathGroup)){
                        groupAlternativeLink(pathGroup);
                    }
                }
                if (isAction(pathAlternative.elements[elem])){
                    const pathAction = pathAlternative.elements[elem];
                    if(isAction(pathAction)){
                        linkAction(pathAction);
                    }
                }
            }
        }
    }

    /**
     * Définit les dépendences d'une règle et fait un premier tri dans l'arbre
     * @param rule contiens la règle qui doit être traitée
     */
    function makeLink(rule: GrammarAST.AbstractRule){
        if(isParserRule(rule)){
            if(isAlternatives(rule.definition) || isGroup(rule.definition)){
                const pathAlternativeOrGroup = rule.definition;
                if(isAlternatives(pathAlternativeOrGroup) || isGroup(pathAlternativeOrGroup)){
                    groupAlternativeLink(pathAlternativeOrGroup);
                }
            }
            if(isRuleCall(rule.definition)){
                const pathRuleCall = rule.definition;
                const fleche =  defFleche(rule);
                syncWriteFile(fileName,rule.name + fleche + pathRuleCall.rule.$refText + '\n',false);
            }
            if(isInferredType(rule.inferredType)){
                const fleche = defFleche(rule);
                const pathInferredType = rule.inferredType;
                syncWriteFile(fileName, pathInferredType.name +  fleche + rule.name +  '\n',false);
            }
        }
        syncWriteFile(fileName, '\n',false); // saut de ligne pour la mise en forme
    }
}

// Essai pour sprotty
//
// export class sprottyDiagram extends LangiumDiagramGenerator {
//     protected override generateRoot(_args: GeneratorContext<AstNode>): SModelRoot | Promise<SModelRoot> {
//         throw new Error('Method not implemented.');
//     }
// }