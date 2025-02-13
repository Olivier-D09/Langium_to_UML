/******************************************************************************
 * Copyright 2021 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { URI } from 'vscode-uri';
import type { Grammar, LangiumServices, Reference } from 'langium';
import type { LangiumConfig } from '../package.js';
import { CompositeGeneratorNode, NL, normalizeEOL, toString } from 'langium';
import { generatedHeader } from './util.js';

export function serializeGrammar(services: LangiumServices, grammars: Grammar[], config: LangiumConfig): string {
    const node = new CompositeGeneratorNode();
    node.append(generatedHeader);

    if (config.langiumInternal) {
        node.append(
            `import type { Grammar } from './ast${config.importExtension}';`, NL,
            `import { loadGrammarFromJson } from '../../utils/grammar-util${config.importExtension}';`);
    } else {
        node.append(
            "import type { Grammar } from 'langium';", NL,
            "import { loadGrammarFromJson } from 'langium';");
    }
    node.append(NL, NL);

    for (let i = 0; i < grammars.length; i++) {
        const grammar = grammars[i];
        if (grammar.name) {
            const production = config.mode === 'production';
            const delimiter = production ? "'" : '`';
            const uriConverter = (uri: URI, ref: Reference) => {
                // We expect the grammar to be self-contained after the transformations we've done before
                throw new Error(`Unexpected reference to symbol '${ref.$refText}' in document: ${uri.toString()}`);
            };
            const serializedGrammar = services.serializer.JsonSerializer.serialize(grammar, {
                space: production ? undefined : 2,
                uriConverter
            });
            // The json serializer returns strings with \n line delimiter by default
            // We need to translate these line endings to the OS specific line ending
            const json = normalizeEOL(serializedGrammar
                .replace(/\\/g, '\\\\')
                .replace(new RegExp(delimiter, 'g'), '\\' + delimiter));
            node.append(
                'let loaded', grammar.name, 'Grammar: Grammar | undefined;', NL,
                'export const ', grammar.name, 'Grammar = (): Grammar => loaded', grammar.name, 'Grammar ?? (loaded', grammar.name, 'Grammar = loadGrammarFromJson(', delimiter, json, delimiter, '));', NL
            );
            if (i < grammars.length - 1) {
                node.append(NL);
            }
        }
    }
    return toString(node);
}
