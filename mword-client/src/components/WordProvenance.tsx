import type { Word } from '../lib/types';

export function WordProvenance({ word }: { word: Word }) {
  const draft = word.definitionStatus === 'reverse-gloss-draft' || word.definitionStatus === 'editorial-draft';
  const sourceUrl = word.definitionSourceUrl || (!word.definitionSource ? word.sourceUrl : undefined);
  return <div className="word-provenance">
    {draft && <p className="source-note definition-draft">基础释义待校对，请结合例句和来源确认。</p>}
    {word.usageNote && <p className="source-note usage-note">用法提示：{word.usageNote}</p>}
    {word.definitionSource && <small className="source-note">
      释义来源：{word.definitionSourceUrl
        ? <a href={word.definitionSourceUrl} target="_blank" rel="noreferrer">{word.definitionSource}</a>
        : word.definitionSource}{word.definitionLicense && ` · ${word.definitionLicense}`}
    </small>}
  </div>;
}

export function ExampleAttribution({ word }: { word: Word }) {
  const source = word.exampleSource;
  if (!source) return null;
  return <details className="example-attribution">
    <summary>语料例句 · 与基础释义的对应关系待核对</summary>
    <p><a href={source.url} target="_blank" rel="noreferrer">英文原句</a> · <a href={source.translationUrl} target="_blank" rel="noreferrer">中文原句</a> · <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a></p>
    <p>{source.name} · {source.attribution}</p><p>{source.changes}</p>
  </details>;
}
