-- IB Math AA question bank: seed data
insert into subjects (code, name)
values ('MAA', 'Mathematics: Analysis and Approaches')
on conflict (code) do nothing;
