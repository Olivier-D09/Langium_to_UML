/******************************************************************************
 * Copyright 2021 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { CancellationToken, DocumentHighlightParams } from 'vscode-languageserver';
import type { GrammarConfig } from '../grammar/grammar-config.js';
import type { NameProvider } from '../references/name-provider.js';
import type { FindReferencesOptions, References } from '../references/references.js';
import type { LangiumServices } from '../services.js';
import type { MaybePromise } from '../utils/promise-util.js';
import type { ReferenceDescription } from '../workspace/ast-descriptions.js';
import type { LangiumDocument } from '../workspace/documents.js';
import { DocumentHighlight } from 'vscode-languageserver';
import { getDocument } from '../utils/ast-util.js';
import { findDeclarationNodeAtOffset } from '../utils/cst-util.js';
import { UriUtils } from '../utils/uri-util.js';

/**
 * Language-specific service for handling document highlight requests.
 */
export interface DocumentHighlightProvider {
    /**
     * Handle a document highlight request.
     *
     * @throws `OperationCancelled` if cancellation is detected during execution
     * @throws `ResponseError` if an error is detected that should be sent as response to the client
     */
    getDocumentHighlight(document: LangiumDocument, params: DocumentHighlightParams, cancelToken?: CancellationToken): MaybePromise<DocumentHighlight[] | undefined>;
}

export class DefaultDocumentHighlightProvider implements DocumentHighlightProvider {
    protected readonly references: References;
    protected readonly nameProvider: NameProvider;
    protected readonly grammarConfig: GrammarConfig;

    constructor(services: LangiumServices) {
        this.references = services.references.References;
        this.nameProvider = services.references.NameProvider;
        this.grammarConfig = services.parser.GrammarConfig;
    }

    getDocumentHighlight(document: LangiumDocument, params: DocumentHighlightParams): MaybePromise<DocumentHighlight[] | undefined> {
        const rootNode = document.parseResult.value.$cstNode;
        if (!rootNode) {
            return undefined;
        }
        const selectedNode = findDeclarationNodeAtOffset(rootNode, document.textDocument.offsetAt(params.position), this.grammarConfig.nameRegexp);
        if (!selectedNode) {
            return undefined;
        }
        const targetAstNode = this.references.findDeclaration(selectedNode);
        if (targetAstNode) {
            const includeDeclaration = UriUtils.equals(getDocument(targetAstNode).uri, document.uri);
            const options: FindReferencesOptions = { documentUri: document.uri, includeDeclaration };
            const references = this.references.findReferences(targetAstNode, options);
            return references.map(ref => this.createDocumentHighlight(ref)).toArray();
        }
        return undefined;
    }

    /**
    * Override this method to determine the highlight kind of the given reference.
    */
    protected createDocumentHighlight(reference: ReferenceDescription): DocumentHighlight {
        return DocumentHighlight.create(reference.segment.range);
    }
}
