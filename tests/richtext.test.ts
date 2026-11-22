// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { htmlToText, sanitizeHtml, textToHtml } from '../src/ui/sanitize';

describe('Formatierter Text', () => {
  it('lässt nur erlaubte Formatierung durch', () => {
    const dirty = '<h1 onclick="x()">Titel</h1><p style="color:red">Text <b>fett</b> <a href="javascript:alert(1)">Link</a><script>alert(1)</script></p><img src="https://example.org/x.png"><img data-media="M012" onerror="x()" alt="Foto">';
    expect(sanitizeHtml(dirty)).toBe('<h2>Titel</h2><p>Text <b>fett</b> Link</p><img data-media="M012" alt="Foto">');
  });
  it('wandelt alten Freitext in Absätze um und schützt Sonderzeichen', () => {
    expect(textToHtml('Erste Zeile\nzweite\n\n<Absatz> & mehr')).toBe('<p>Erste Zeile<br>zweite</p><p>&lt;Absatz&gt; &amp; mehr</p>');
    expect(sanitizeHtml('Kein <b>HTML</b> am Anfang')).toBe('<p>Kein &lt;b&gt;HTML&lt;/b&gt; am Anfang</p>');
  });
  it('liefert lesbaren Text zurück', () => {
    expect(htmlToText('<h2>Kindheit</h2><p>In Łódź &amp; Umgebung</p><ul><li>eins</li></ul>')).toBe('Kindheit\nIn Łódź & Umgebung\neins');
  });
});
