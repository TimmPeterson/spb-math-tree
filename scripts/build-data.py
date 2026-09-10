"""Normalize the cited research files into the dependency-free browser dataset."""
import json
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
FILES = ['research-algebra.json', 'research-analysis.json', 'research-discrete.json']
FILES += [f.name for f in [ROOT / 'research-foundations.json', ROOT / 'research-junior.json'] if f.exists()]
FILES += [f.name for f in sorted(ROOT.glob('research-expanded-*.json'))]
FILES += [f.name for f in sorted(ROOT.glob('research-connections-*.json'))]
NOTES = {
 'lubkov': 'The MCS profile names Nikolai Vavilov and Victor Petrov as co-supervisors. His personal page describes an associate professorship as of July 2026.',
 'voronetsky': 'Documented as Vavilov’s doctoral student in 2021; a later Russian Science Foundation record confirms his Candidate degree.',
 'bondarko': 'The degree date follows his MCS faculty profile.',
 'khavin': 'Historical SPbSU faculty, 1933–2015. His work predates the foundation of MCS. The degree date follows the memorial article.',
 'nikolski': 'Former PDMI and SPbSU affiliation; later associated with Bordeaux. The SPbSU memorial identifies him as Khavin’s first graduate student.',
 'kislyakov': 'His own Candidate supervisor was D. A. Vladimirov (1976), whose profile is not yet included in this collection.',
 'zlotnikov': 'PDMI doctoral alumnus; subsequently a postdoctoral researcher at NTNU. His 2023 Stavanger PhD was supervised by Alexander Ulanovskii, with Kislyakov as co-supervisor.',
 'dospolova': 'The dissertation council voted in favor of the Candidate degree on February 16, 2026. She also leads a student seminar in probability and geometry.',
 'tatiana-belova': 'Doctoral research and its supervisor are documented in a 2023 contest. MCS and PDMI list her as a researcher; present doctoral enrollment is not independently confirmed.',
 'golub': 'Doctoral status and advisor are documented in the November 2025 announcement of the 2026 Rokhlin scholarships. Present enrollment and a separate student-mentoring role have not been independently confirmed.',
 'kudryakov': 'Doctoral status and advisor are documented in the November 2025 announcement of the 2026 Rokhlin scholarships. Present enrollment and a separate student-mentoring role have not been independently confirmed.',
 'platonova': 'Her dissertation specialty was mathematical physics; her research interests connect it with stochastic analysis and probability.',
 'stanislav-smirnov': 'The MCS directory lists him as principal researcher and scientific director. His Caltech doctoral adviser was Nikolai Makarov; Viktor Khavin supervised his earlier BSc/MSc work at St. Petersburg State University.',
 'makarov': 'Professor at Caltech and an alumnus of Leningrad University and LOMI (now PDMI). Included here as Stanislav Smirnov’s doctoral adviser.',
}
HISTORICAL = {'vavilov', 'vostokov', 'yuri-burago', 'khavin', 'nikolski', 'vershik', 'faddeev', 'ladyzhenskaya'}
STUDENTS = {'golub', 'kudryakov', 'tatiana-belova'}
ALUMNI = {'tsybyshev', 'neshitov', 'vladimir-zolotov', 'alena-zhukova'}
SHORT_AFFILIATIONS = {
 'zlotnikov': 'PDMI alumnus · NTNU',
 'hirsch': 'Former MCS / PDMI',
 'bliznets': 'Former MCS / PDMI',
 'nikolski': 'SPbSU / PDMI · former',
 'itsykson': 'PDMI · on leave',
 'tsybyshev': 'PDMI alumnus',
 'neshitov': 'PDMI alumnus',
 'vladimir-zolotov': 'PDMI alumnus',
 'alena-zhukova': 'SPbSU · historical',
 'makarov': 'Caltech · PDMI alumnus',
}

def sources(items):
    return [{'label': s.get('label', s.get('title', 'Source')), 'url': s['url']} for s in items]

# Later research files can correct a degree, affiliation, or enrollment record.
raw_people, raw_links, updated = {}, [], set()
for filename in FILES:
    data = json.loads((ROOT / filename).read_text())
    for person in data.get('people', []):
        person = dict(person)
        if 'affiliations' not in person and 'institutions' in person:
            person['affiliations'] = person['institutions']
        if 'notes' not in person and 'note' in person:
            person['notes'] = person['note']
        old = raw_people.get(person['id'], {})
        refs = sources(person.get('sources', [])) + sources(old.get('sources', []))
        refs = list({ref['url']: ref for ref in reversed(refs)}.values())
        raw_people[person['id']] = {**old, **person, 'sources': refs}
        if old and filename.startswith(('research-expanded-', 'research-connections-')):
            updated.add(person['id'])
    raw_links.extend(data.get('links', data.get('relationships', [])))

people, links = [], []
CONTEXT = HISTORICAL | ALUMNI | {'zlotnikov', 'hirsch', 'bliznets', 'makarov', 'itsykson'}
for p in raw_people.values():
    affiliations = p.get('affiliations', [])
    affiliation_text = '; '.join(affiliations)
    codes = []
    if any(word in affiliation_text for word in ['SPbSU', 'Leningrad University', 'MCS']):
        codes.append('spbu')
    if 'MCS' in affiliation_text:
        codes.append('mcs')
    if 'PDMI' in affiliation_text:
        codes.append('pdmi')
    if p['id'] in ALUMNI and p['id'] not in updated:
        affiliation_text += ' · doctoral / historical affiliation'
    if p['id'] in HISTORICAL and not any(x in affiliation_text.lower() for x in ['historical', 'former']):
        affiliation_text += ' · historical lineage'
    degree = p.get('degree', 'Qualification not listed in the source')
    stage = p.get('stage') or ('student' if p['id'] in STUDENTS or 'PhD student' in p.get('status', '') else 'historical' if p['id'] in HISTORICAL else 'established')
    if stage not in {'student', 'historical', 'established', 'researcher'}:
        raise ValueError(f"Unknown career stage for {p['id']}: {stage}")
    if p['id'] == 'alena-zhukova':
        degree = 'PhD · 2012 (advisor’s CV)'
    short = p.get('degreeShort') or ('PhD student' if stage == 'student' else 'DSc' if 'Doctor of Sciences' in degree else 'Cand. Sci.' if 'Candidate of Sciences' in degree else 'PhD' if 'PhD' in degree else 'Defense 2026' if 'defense' in degree else 'Researcher')
    if stage == 'established' and any(word in degree.lower() for word in ['defended', 'defense']):
        year = re.search(r'20\d{2}', degree)
        short = 'Defended' + (' ' + year.group(0) if year else '')
    note = p.get('notes', '') if p['id'] in updated else NOTES.get(p['id'], p.get('notes', ''))
    record = {
        'id': p['id'], 'name': p['name'], 'nativeName': p.get('nameRu', p.get('nativeName', '')),
        'field': p['field'], 'stage': stage, 'degree': degree, 'degreeShort': short,
        'affiliation': affiliation_text, 'institutions': codes,
        'interests': p.get('interests') or p['field'].capitalize(), 'note': note,
        'contextOnly': p.get('contextOnly', stage == 'historical' or (p['id'] in CONTEXT and not p.get('current', False))),
        'sources': sources(p.get('sources', [])),
    }
    if p.get('affiliationShort'):
        record['affiliationShort'] = p['affiliationShort']
    elif p['id'] in SHORT_AFFILIATIONS and p['id'] not in updated:
        record['affiliationShort'] = SHORT_AFFILIATIONS[p['id']]
    for key in ['statusAsOf', 'enrollmentEnd', 'status', 'aliases', 'cohort']:
        if p.get(key) is not None:
            record[key] = p[key]
    people.append(record)

edge_index = {}
for l in raw_links:
    kind = l.get('type', 'doctoral')
    # A dedication identifying a teacher does not establish research supervision.
    if kind == 'mathematical-mentor':
        continue
    year = l.get('year')
    if kind == 'current-doctoral':
        label = 'Doctoral advisor · 2026 scholarship record'
    elif l['target'] == 'tatiana-belova':
        label = 'Doctoral research supervisor · recorded 2023'
    else:
        label = ('PhD co-supervision' if (l['source'], l['target']) == ('nikolski', 'baranov') else 'Doctoral supervision') + (f' · {year}' if year else '')
    kind = 'doctoral' if kind in ['doctoral', 'phd', 'current-doctoral'] or l['target'] == 'tatiana-belova' else 'mentorship'
    key = (l['source'], l['target'], kind)
    label = l.get('label', label)
    if year and not re.search(r'\b(?:19|20)\d{2}\b', label):
        label += f' · {year}'
    edge = {'source': l['source'], 'target': l['target'], 'type': kind, 'label': label, 'note': l.get('notes', l.get('note', '')), 'sources': sources(l.get('sources', []))}
    if key in edge_index:
        refs = edge['sources'] + edge_index[key]['sources']
        edge['sources'] = list({ref['url']: ref for ref in reversed(refs)}.values())
    edge_index[key] = edge
links = list(edge_index.values())

ids = {p['id'] for p in people}
assert len(ids) == len(people)
assert all(l['source'] in ids and l['target'] in ids for l in links), 'A supervisor or advisee is missing from the roster'
assert all(p['sources'] and p['interests'] for p in people)
assert all(l['sources'] for l in links)
assert all(p['field'] in {'algebra', 'analysis', 'geometry', 'discrete', 'physics', 'probability'} for p in people)
# Reconstructed connections must still form an acyclic supervision graph.
children = {id: set() for id in ids}
indegree = dict.fromkeys(ids, 0)
for link in links:
    source, target = link['source'], link['target']
    assert source != target, f'Self-supervision recorded for {source}'
    if target not in children[source]:
        children[source].add(target)
        indegree[target] += 1
queue = [id for id, count in indegree.items() if not count]
visited = 0
while queue:
    source = queue.pop()
    visited += 1
    for target in children[source]:
        indegree[target] -= 1
        if not indegree[target]:
            queue.append(target)
assert visited == len(ids), 'A cycle exists in the supervision records'
result = {'checkedAt': '2026-09-10', 'people': people, 'links': links}
(ROOT / 'data.js').write_text('// Source-linked collection. Regenerate with python3 scripts/build-data.py.\nwindow.LINEAGE_DATA = ' + json.dumps(result, ensure_ascii=False, indent=2) + ';\n')
print(f"Built {len(people)} people ({sum(p['stage'] == 'student' for p in people)} doctoral students / entrants) and {len(links)} documented connections.")
