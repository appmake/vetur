import * as _ from 'lodash';

import { LanguageModelCache, getLanguageModelCache } from '../../embeddedSupport/languageModelCache';
import { TextDocument, Position, Range, FormattingOptions } from 'vscode-languageserver-types';
import { LanguageMode } from '../../embeddedSupport/languageModes';
import { VueDocumentRegions } from '../../embeddedSupport/embeddedSupport';
import { HTMLDocument } from './parser/htmlParser';
import { doComplete } from './services/htmlCompletion';
import { doHover } from './services/htmlHover';
import { findDocumentHighlights } from './services/htmlHighlighting';
import { findDocumentLinks } from './services/htmlLinks';
import { findDocumentSymbols } from './services/htmlSymbolsProvider';
import { htmlFormat } from './services/htmlFormat';
import { parseHTMLDocument } from './parser/htmlParser';
import { doESLintValidation, createLintEngine } from './services/htmlValidation';
import { findDefinition } from './services/htmlDefinition';
import { getTagProviderSettings, IHTMLTagProvider, CompletionConfiguration } from './tagProviders';
import { getEnabledTagProviders } from './tagProviders';
import { DocumentContext } from '../../types';
import { VLSFormatConfig } from '../../config';
import { VueInfoService } from '../../services/vueInfoService';
import { getComponentInfoTagProvider } from './tagProviders/componentInfoTagProvider';

type DocumentRegionCache = LanguageModelCache<VueDocumentRegions>;

export class HTMLMode implements LanguageMode {
  private tagProviderSettings: CompletionConfiguration;
  private enabledTagProviders: IHTMLTagProvider[];
  private embeddedDocuments: LanguageModelCache<TextDocument>;
  private vueDocuments: LanguageModelCache<HTMLDocument>;

  private config: any = {};

  private lintEngine = createLintEngine();

  constructor(
    documentRegions: DocumentRegionCache,
    workspacePath: string | undefined,
    private vueInfoService?: VueInfoService
  ) {
    this.tagProviderSettings = getTagProviderSettings(workspacePath);
    this.enabledTagProviders = getEnabledTagProviders(this.tagProviderSettings);
    this.embeddedDocuments = getLanguageModelCache<TextDocument>(10, 60, document =>
      documentRegions.get(document).getSingleLanguageDocument('vue-html')
    );
    this.vueDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => parseHTMLDocument(document));
  }

  getId() {
    return 'html';
  }

  configure(c: any) {
    this.tagProviderSettings = _.assign(this.tagProviderSettings, c.html.suggest);
    this.enabledTagProviders = getEnabledTagProviders(this.tagProviderSettings);
    this.config = c;
  }

  doValidation(document: TextDocument) {
    const embedded = this.embeddedDocuments.get(document);
    return doESLintValidation(embedded, this.lintEngine);
  }
  doComplete(document: TextDocument, position: Position) {
    const embedded = this.embeddedDocuments.get(document);
    const tagProviders: IHTMLTagProvider[] = [...this.enabledTagProviders];

    const info = this.vueInfoService ? this.vueInfoService.getInfo(document) : undefined;
    if (info && info.componentInfo.childComponents) {
      tagProviders.push(getComponentInfoTagProvider(info.componentInfo.childComponents));
    }

    return doComplete(embedded, position, this.vueDocuments.get(embedded), tagProviders, this.config.emmet, info);
  }
  doHover(document: TextDocument, position: Position) {
    const embedded = this.embeddedDocuments.get(document);
    const tagProviders: IHTMLTagProvider[] = [...this.enabledTagProviders];

    return doHover(embedded, position, this.vueDocuments.get(embedded), tagProviders);
  }
  findDocumentHighlight(document: TextDocument, position: Position) {
    return findDocumentHighlights(document, position, this.vueDocuments.get(document));
  }
  findDocumentLinks(document: TextDocument, documentContext: DocumentContext) {
    return findDocumentLinks(document, documentContext);
  }
  findDocumentSymbols(document: TextDocument) {
    return findDocumentSymbols(document, this.vueDocuments.get(document));
  }
  format(document: TextDocument, range: Range, formattingOptions: FormattingOptions) {
    return htmlFormat(document, range, this.config.vetur.format as VLSFormatConfig);
  }
  findDefinition(document: TextDocument, position: Position) {
    const embedded = this.embeddedDocuments.get(document);
    const info = this.vueInfoService ? this.vueInfoService.getInfo(document) : undefined;
    return findDefinition(embedded, position, this.vueDocuments.get(embedded), info);
  }
  onDocumentRemoved(document: TextDocument) {
    this.vueDocuments.onDocumentRemoved(document);
  }
  dispose() {
    this.vueDocuments.dispose();
  }
}