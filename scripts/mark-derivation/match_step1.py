import json

rows = json.load(open('may2024_all_parts.json'))

step1_files = {
    ('HL', 'TZ1', 1): 'step1_out_HL_TZ1_P1.json',
    ('HL', 'TZ2', 1): 'step1_out_HL_TZ2_P1.json',
    ('HL', 'TZ1', 2): 'step1_out_HL_TZ1_P2.json',
    ('HL', 'TZ2', 2): 'step1_out_HL_TZ2_P2.json',
    ('HL', 'TZ1', 3): 'step1_out_HL_TZ1_P3.json',
    ('HL', 'TZ2', 3): 'step1_out_HL_TZ2_P3.json',
    ('SL', 'TZ1', 1): 'step1_out_SL_TZ1_P1.json',
    ('SL', 'TZ2', 1): 'step1_out_SL_TZ2_P1.json',
    ('SL', 'TZ1', 2): 'step1_out_SL_TZ1_P2.json',
    ('SL', 'TZ2', 2): 'step1_out_SL_TZ2_P2.json',
}
step1_data = {k: json.load(open(v)) for k, v in step1_files.items()}

paper_explicit = []
needs_step2 = []
no_match = []

for r in rows:
    key = (r['level'], r['time_zone'], r['paper_number'])
    qmap = step1_data[key]
    qn = str(r['question_number'])
    label = r['part_label']
    if qn not in qmap:
        no_match.append(r)
        continue
    parts = qmap[qn]['parts']
    if label not in parts:
        no_match.append(r)
        continue
    info = parts[label]
    if info.get('own_bracket') is not None and not info.get('ambiguous'):
        paper_explicit.append({**r, 'step1': info, 'question_max_mark_step1': qmap[qn]['max_mark']})
    else:
        needs_step2.append({**r, 'step1': info, 'question_max_mark_step1': qmap[qn]['max_mark']})

print(f'Total rows: {len(rows)}')
print(f'paper_explicit (STEP1 confident): {len(paper_explicit)}')
print(f'needs_step2 (grouped/ambiguous): {len(needs_step2)}')
print(f'no_match (STEP1 parser found nothing for this label): {len(no_match)}')

json.dump(paper_explicit, open('may2024_paper_explicit.json', 'w'), indent=2)
json.dump(needs_step2, open('may2024_needs_step2.json', 'w'), indent=2)
json.dump(no_match, open('may2024_no_match.json', 'w'), indent=2)

if no_match:
    print()
    print('NO MATCH rows:')
    for r in no_match:
        print(' ', r['level'], r['time_zone'], 'P'+str(r['paper_number']), 'Q'+str(r['question_number'])+'('+r['part_label']+')')
