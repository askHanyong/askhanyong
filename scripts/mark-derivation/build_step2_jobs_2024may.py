import json
from collections import defaultdict

all_parts = json.load(open('may2024_all_parts.json'))
by_id = {r['part_id']: r for r in all_parts}

pe = json.load(open('may2024_paper_explicit.json'))
needs = json.load(open('may2024_needs_step2.json'))

known_marks = {r['part_id']: r['step1']['own_bracket'] for r in pe}

by_q = defaultdict(list)
for r in all_parts:
    key = (r['level'], r['time_zone'], r['paper_number'], r['question_number'])
    by_q[key].append(r)

paper_labels = {
    ('HL', 'TZ1', 1): 'HL24MayTZ1P1', ('HL', 'TZ2', 1): 'HL24MayTZ2P1',
    ('HL', 'TZ1', 2): 'HL24MayTZ1P2', ('HL', 'TZ2', 2): 'HL24MayTZ2P2',
    ('HL', 'TZ1', 3): 'HL24MayTZ1P3', ('HL', 'TZ2', 3): 'HL24MayTZ2P3',
    ('SL', 'TZ1', 1): 'SL24MayTZ1P1', ('SL', 'TZ2', 1): 'SL24MayTZ2P1',
    ('SL', 'TZ1', 2): 'SL24MayTZ1P2', ('SL', 'TZ2', 2): 'SL24MayTZ2P2',
}

jobs = []
for r in needs:
    key = (r['level'], r['time_zone'], r['paper_number'], r['question_number'])
    siblings = [
        {'part_label': s['part_label'], 'known_value': known_marks.get(s['part_id'])}
        for s in by_q[key] if s['part_id'] != r['part_id']
    ]
    jobs.append({
        'part_id': r['part_id'],
        'paper_label': paper_labels[(r['level'], r['time_zone'], r['paper_number'])],
        'question_number': r['question_number'],
        'part_label': r['part_label'],
        'question_max_mark': r['question_max_mark'],
        'group_combined_bracket': r['step1'].get('group_combined_bracket'),
        'group_siblings': r['step1'].get('group_siblings', [r['part_label']]),
        'markscheme_text': r['markscheme_text'],
        'marks_breakdown': r['marks_breakdown'],
        'other_siblings_in_question': siblings,
        'force_review': r.get('force_review', False),
    })

json.dump(jobs, open('may2024_step2_jobs.json', 'w'), indent=2)
print(f'Wrote {len(jobs)} STEP2 jobs')
