import { useMemo, useState } from 'react';
import { addParentChild, addPartnership, addPerson, quickDefaults, type NewPersonInput } from '../model/ops';
import { displayName, Index } from '../model/queries';
import { search } from '../model/search';
import type { ParentChildType, PartnershipState, Sex } from '../model/types';
import { PARTNERSHIP_LABEL, PC_TYPE_LABEL } from '../model/types';
import { update, useStore } from '../state/store';
import { Sheet } from '../ui/common';

export type QuickRel = 'kind' | 'partner' | 'elternteil';
const TITLE: Record<QuickRel, string> = { kind: 'Kind hinzufügen', partner: 'Partner/in hinzufügen', elternteil: 'Elternteil hinzufügen' };

/** Schnellerfassung direkt an der Person – neue Person anlegen oder vorhandene verknüpfen */
export function QuickAdd({ anchorId, rel, onClose, onDone }: { anchorId: string; rel: QuickRel; onClose: () => void; onDone?: (id: string) => void }) {
  const doc = useStore((s) => s.doc);
  const idx = useMemo(() => new Index(doc), [doc]);
  const defaults = useMemo(() => quickDefaults(doc, anchorId, rel), [doc, anchorId, rel]);
  const [mode, setMode] = useState<'neu' | 'vorhanden'>('neu');
  const [f, setF] = useState<NewPersonInput>(defaults);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string>();
  const [pcType, setPcType] = useState<ParentChildType>('leiblich');
  const [paState, setPaState] = useState<PartnershipState>('verheiratet');
  const partners = idx.partners(anchorId);
  const [otherParent, setOtherParent] = useState<string>(partners.length === 1 ? partners[0] : '');
  const hits = q.length > 1 ? search(doc, q, 15).filter((h) => h.kind === 'person' && h.id !== anchorId) : [];

  const save = () => {
    let newId = '';
    update(`${anchorId}: ${TITLE[rel]}`, (d) => {
      let id = picked;
      if (mode === 'neu') {
        if (!f.given && !f.surname) return;
        id = addPerson(d, f).id;
      }
      if (!id) return;
      newId = id;
      if (rel === 'kind') {
        addParentChild(d, anchorId, id, pcType);
        if (otherParent) addParentChild(d, otherParent, id, pcType);
      } else if (rel === 'elternteil') {
        addParentChild(d, id, anchorId, pcType);
      } else {
        addPartnership(d, anchorId, id, paState);
      }
    });
    onClose();
    if (newId) onDone?.(newId);
  };

  return (
    <Sheet
      title={TITLE[rel]}
      onClose={onClose}
      actions={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn-primary" onClick={save} disabled={mode === 'neu' ? !f.given && !f.surname : !picked}>
            Speichern
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">zu {idx.person(anchorId) ? displayName(idx.person(anchorId)!) : anchorId}</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button className={mode === 'neu' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('neu')}>
          Neue Person
        </button>
        <button className={mode === 'vorhanden' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('vorhanden')}>
          Vorhandene Person
        </button>
      </div>
      {mode === 'neu' ? (
        <div className="grid gap-3">
          <label>
            <span className="label">Vorname(n)</span>
            <input className="field" autoFocus value={f.given ?? ''} onChange={(e) => setF({ ...f, given: e.target.value })} />
          </label>
          <label>
            <span className="label">Nachname</span>
            <input className="field" value={f.surname ?? ''} onChange={(e) => setF({ ...f, surname: e.target.value })} />
            {defaults.surname && <span className="mt-1 block text-xs text-muted">vorbelegt – bei Bedarf ändern oder leeren</span>}
          </label>
          <label>
            <span className="label">Geburtsname (nur wenn bekannt)</span>
            <input className="field" value={f.birthName ?? ''} onChange={(e) => setF({ ...f, birthName: e.target.value })} />
          </label>
          <div>
            <span className="label">Geschlecht</span>
            <div className="grid grid-cols-4 gap-2">
              {(['w', 'm', 'd', 'u'] as Sex[]).map((s) => (
                <button key={s} className={f.sex === s ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setF({ ...f, sex: s })}>
                  {{ w: 'weibl.', m: 'männl.', d: 'divers', u: 'unbek.' }[s]}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="label">Geburt (optional)</span>
            <input className="field" placeholder="TT.MM.JJJJ, ca. 1950 …" value={f.birth ?? ''} onChange={(e) => setF({ ...f, birth: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="grid gap-2">
          <input className="field" autoFocus placeholder="Name oder ID suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((h) => (
            <button key={h.id} className={`btn-ghost justify-between ${picked === h.id ? 'border-moss bg-moss-light' : ''}`} onClick={() => setPicked(h.id)}>
              <span>{h.title}</span>
              <span className="text-xs text-muted">{h.id}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-3">
        {rel !== 'partner' ? (
          <label>
            <span className="label">Art der Eltern-Kind-Beziehung</span>
            <select className="field" value={pcType} onChange={(e) => setPcType(e.target.value as ParentChildType)}>
              {Object.entries(PC_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : (
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
        {rel === 'kind' && partners.length > 0 && (
          <label>
            <span className="label">Anderer Elternteil</span>
            <select className="field" value={otherParent} onChange={(e) => setOtherParent(e.target.value)}>
              <option value="">– unbekannt / nicht zuordnen –</option>
              {partners.map((pid) => (
                <option key={pid} value={pid}>
                  {displayName(idx.person(pid)!)} ({pid})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Sheet>
  );
}
