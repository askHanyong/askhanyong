import json
from collections import defaultdict

results = json.load(open('may2024_step2_results.json'))
jobs_list = json.load(open('may2024_step2_jobs.json'))
jobs = {j['part_id']: j for j in jobs_list}
pe = json.load(open('may2024_paper_explicit.json'))
all_parts = json.load(open('may2024_all_parts.json'))

paper_labels = {
    ('HL', 'TZ1', 1): 'HL24MayTZ1P1', ('HL', 'TZ2', 1): 'HL24MayTZ2P1',
    ('HL', 'TZ1', 2): 'HL24MayTZ1P2', ('HL', 'TZ2', 2): 'HL24MayTZ2P2',
    ('HL', 'TZ1', 3): 'HL24MayTZ1P3', ('HL', 'TZ2', 3): 'HL24MayTZ2P3',
    ('SL', 'TZ1', 1): 'SL24MayTZ1P1', ('SL', 'TZ2', 1): 'SL24MayTZ2P1',
    ('SL', 'TZ1', 2): 'SL24MayTZ1P2', ('SL', 'TZ2', 2): 'SL24MayTZ2P2',
}

known_marks = {r['part_id']: r['step1']['own_bracket'] for r in pe}
derived = {r['part_id']: r['run1']['derived_value'] for r in results}
resolved = dict(known_marks)
resolved.update(derived)

# id -> (paper_label, question_number, part_label)
part_info = {}
for r in all_parts:
    pl = paper_labels[(r['level'], r['time_zone'], r['paper_number'])]
    part_info[r['part_id']] = (pl, r['question_number'], r['part_label'], r['question_max_mark'])

by_q = defaultdict(list)
for pid, (pl, qn, label, qmax) in part_info.items():
    by_q[(pl, qn)].append(pid)

flagged_for_review = []
clean_to_apply = []

force_review_ids = {j['part_id'] for j in jobs_list if j.get('force_review')}

# group-level check
group_bad_parts = set()
for job in jobs_list:
    gcb = job['group_combined_bracket']
    if gcb is None:
        continue
    pid = job['part_id']
    pl, qn, label, qmax = part_info[pid]
    sibling_labels = job['group_siblings']
    # find sibling part_ids in same question matching those labels
    sib_ids = [p for p in by_q[(pl, qn)] if part_info[p][2] in sibling_labels]
    total = sum(resolved.get(p, 0) for p in sib_ids)
    if total != gcb:
        for p in sib_ids:
            group_bad_parts.add(p)

# question-total check (only for questions where ALL parts are now resolved)
q_bad_parts = set()
for (pl, qn), pids in by_q.items():
    if not all(p in resolved for p in pids):
        continue
    qmax = part_info[pids[0]][3]
    total = sum(resolved[p] for p in pids)
    if total != qmax:
        for p in pids:
            if p in jobs:  # only flag the STEP2-derived ones, not paper_explicit
                q_bad_parts.add(p)

for job in jobs_list:
    pid = job['part_id']
    r = next(x for x in results if x['part_id'] == pid)
    entry = {
        'part_id': pid, 'paper_label': job['paper_label'], 'question_number': job['question_number'],
        'part_label': job['part_label'], 'derived_value': r['run1']['derived_value'],
        'tally_notes': r['run1']['tally_notes'],
    }
    reasons = []
    if pid in force_review_ids:
        reasons.append('STEP1 could not locate this part on the paper (structural parser limit)')
    if pid in group_bad_parts:
        reasons.append('group-bracket reconciliation failed')
    if pid in q_bad_parts:
        reasons.append('question-total reconciliation failed')
    if reasons:
        entry['reasons'] = reasons
        flagged_for_review.append(entry)
    else:
        clean_to_apply.append(entry)

print(f'Total STEP2 jobs: {len(jobs_list)}')
print(f'Clean (dual-run agree + all reconciliation checks pass): {len(clean_to_apply)}')
print(f'Flagged for review: {len(flagged_for_review)}')
for f in flagged_for_review:
    print(' ', f['paper_label'], f"Q{f['question_number']}({f['part_label']})", 'derived=', f['derived_value'], f['reasons'])

json.dump(clean_to_apply, open('may2024_step2_clean.json', 'w'), indent=2)
json.dump(flagged_for_review, open('may2024_step2_flagged.json', 'w'), indent=2)
