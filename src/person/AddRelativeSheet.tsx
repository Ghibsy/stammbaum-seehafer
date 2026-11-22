import { useMemo, useState } from 'react';
import { displayName, Index } from '../model/queries';
import { addRelative, RELATION_LABEL, relationSex, suggestedSurname, type Relation } from '../model/relatives';
import type { PartnershipState, Sex } from '../model/types';
import { PARTNERSHIP_LABEL } from '../model/types';
import { update, useStore } from '../state/store';
import { openBranches } from '../tree/viewSettings';
import { Sheet } from '../ui/common';
import { go } from '../ui/router';

const RELATIONS: Relation[] = ['vater', 'mutter', 'bruder', 'schwester', 'sohn', 'tochter', 'partner'];

/**
 * Plus an der Kachel: neue Person anlegen und zuerst die Beziehung wählen.
 * Die App ordnet sie dann selbst ein (Eltern, Geschwister über dieselben Eltern, Kinder, Partner).
 */
export function AddRelativeSheet({ anchorId, onClose }: { anchorId: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const idx = useMemo(() => new Index(doc), [doc]);
  const anchor = idx.person(anchorId);
  const [rel, setRel] = useState<Relation>();
  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState('');
  const [birthName, setBirthName] = useState('');
  const [sex, setSex] = useState<Sex>('u');
  const [birth, setBirth] = useState('');
  const partners = idx.partners(anchorId);
  const parents = idx.parents(anchorId);
  const [otherParent, setOtherParent] = useState(partners.length === 1 ? partners[0] : '');
  const [shared, setShared] = useState<string[]>(parents);
  const [placeholder, setPlaceholder] = useState(true);
  const [pair, setPair] = useState(true);
  const [paState, setPaState] = useState<PartnershipState>('verheiratet');
  const [openAfter, setOpenAfter] = useState(false);

  if (!anchor) return null;
  const nm = (id: string) => (idx.person(id) ? displayName(idx.person(id)!) : id);

  const choose = (r: Relation) => {
    setRel(r);
    setSex(relationSex(r, anchor));
    setSurname(suggestedSurname(r, anchor, idx) ?? '');
  };

  const save = () => {
    if (!rel || (!given && !surname)) return;
    let newId = '';
    let expandUp: string[] = [];
    let expandDown: string[] = [];
    update(`${RELATION_LABEL[rel]} zu ${anchorId} angelegt`, (d) => {
      const r = addRelative(
        d,
        anchorId,
        rel,
        { given: given.trim() || undefined, surname: surname.trim() || undefined, birthName: birthName.trim() || undefined, sex, birth: birth.trim() || undefined },
        { otherParentId: otherParent || undefined, sharedParentIds: shared, createPlaceholder: placeholder, pairWithExisting: pair, partnershipState: paState },
      );
      newId = r.person.id;
      expandUp = r.expandUp;
      expandDown = r.expandDown;
    });
    // Zweig aufklappen, damit die neue Person im Stammbaum sofort sichtbar ist
    openBranches(expandUp, expandDown);
    onClose();
    if (openAfter && newId) go('person', newId);
  };

  return (
    <Sheet
      title={rel ? `${RELATION_LABEL[rel]} von ${displayName(anchor)}` : `Neue Person zu ${displayName(anchor)}`}
      onClose={onClose}
      actions={
        rel && (
          <>
            <button className="btn-ghost" onClick={() => setRel(undefined)}>
              Zurück
            </button>
            <button className="btn-primary" disabled={!given && !surname} onClick={save}>
              Speichern
            </button>
          </>
        )
      }
    >
      {!rel ? (
        <>
          <p className="mb-3 text-sm text-muted">Wie ist die neue Person mit {displayName(anchor)} verwandt?</p>
          <div className="grid grid-cols-2 gap-2">
            {RELATIONS.map((r) => (
              <button key={r} className="btn-ghost min-h-14 text-base" onClick={() => choose(r)}>
                {RELATION_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Weitere Beziehungen (Adoption, Pflege, Stiefkind) im Reiter „Familie“ der Person.</p>
        </>
      ) : (
        <div className="grid gap-3">
          <label>
            <span className="label">Vorname(n)</span>
            <input className="field" autoFocus value={given} onChange={(e) => setGiven(e.target.value)} />
          </label>
          <label>
            <span className="label">Nachname</span>
            <input className="field" value={surname} onChange={(e) => setSurname(e.target.value)} />
            {surname && <span className="mt-1 block text-xs text-muted">vorbelegt – bei Bedarf ändern oder leeren</span>}
          </label>
          <label>
            <span className="label">Geburtsname (nur wenn bekannt)</span>
            <input className="field" value={birthName} onChange={(e) => setBirthName(e.target.value)} />
          </label>
          <div>
            <span className="label">Geschlecht</span>
            <div className="grid grid-cols-4 gap-2">
              {(['w', 'm', 'd', 'u'] as Sex[]).map((s) => (
                <button key={s} className={sex === s ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setSex(s)}>
                  {{ w: 'weibl.', m: 'männl.', d: 'divers', u: 'unbek.' }[s]}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="label">Geburt (optional)</span>
            <input className="field" placeholder="TT.MM.JJJJ, ca. 1950 …" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </label>

          {(rel === 'sohn' || rel === 'tochter') && partners.length > 0 && (
            <label>
              <span className="label">Anderer Elternteil</span>
              <select className="field" value={otherParent} onChange={(e) => setOtherParent(e.target.value)}>
                <option value="">– unbekannt / nicht zuordnen –</option>
                {partners.map((p) => (
                  <option key={p} value={p}>
                    {nm(p)} ({p})
                  </option>
                ))}
              </select>
            </label>
          )}
          {(rel === 'bruder' || rel === 'schwester') &&
            (parents.length ? (
              <div className="rounded-xl border border-line p-3 text-sm">
                <span className="label">Gemeinsame Eltern</span>
                {parents.map((p) => (
                  <label key={p} className="flex min-h-10 items-center gap-2">
                    <input type="checkbox" className="h-5 w-5" checked={shared.includes(p)} onChange={(e) => setShared(e.target.checked ? [...shared, p] : shared.filter((x) => x !== p))} />
                    {nm(p)}
                  </label>
                ))}
                <p className="text-xs text-muted">Nur einen Haken setzen für Halbgeschwister.</p>
              </div>
            ) : (
              <label className="flex min-h-11 items-start gap-2 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={placeholder} onChange={(e) => setPlaceholder(e.target.checked)} />
                <span>
                  Gemeinsame Eltern als Platzhalter anlegen (Name unbekannt, Status „abgeleitet“).
                  <span className="block text-xs text-muted">Ohne Haken wird nur eine gestrichelte Geschwister-Verbindung gespeichert.</span>
                </span>
              </label>
            ))}
          {(rel === 'vater' || rel === 'mutter') && parents.some((p) => idx.person(p)?.kind !== 'platzhalter') && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={pair} onChange={(e) => setPair(e.target.checked)} />
              Mit {nm(parents.find((p) => idx.person(p)?.kind !== 'platzhalter')!)} als Paar erfassen (abgeleitet)
            </label>
          )}
          {rel === 'partner' && (
            <label>
              <span className="label">Status der Partnerschaft</span>
              <select className="field" value={paState} onChange={(e) => setPaState(e.target.value as PartnershipState)}>
                {Object.entries(PARTNERSHIP_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} /> danach die neue Person öffnen (weitere Angaben, Foto)
          </label>
        </div>
      )}
    </Sheet>
  );
}
