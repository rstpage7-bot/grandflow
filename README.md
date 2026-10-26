# NEXORA Business + Supabase

واجهة ويب ثابتة لإدارة المهام والتسليمات والملاحظات، مع خيار ربط Supabase Auth وPostgres للمزامنة بين الأجهزة.

## 1) إعداد Supabase
1. أنشئ مشروعًا في https://supabase.com/dashboard
2. من Project Settings → API انسخ Project URL و Publishable key (أو anon key). **لا تستخدم service_role key في المتصفح**.
3. من SQL Editor نفّذ هذا المخطط:

```sql
create table if not exists public.app_state (
  id text not null default 'main',
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.app_state enable row level security;

create policy "Users can read their own app state"
on public.app_state for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own app state"
on public.app_state for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own app state"
on public.app_state for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

4. من Authentication → Providers تأكد أن Email مفعّل.
5. افتح الموقع المنشور واضغط **إعداد Supabase**، والصق Project URL و Publishable/anon key ثم احفظ.
6. اضغط **تسجيل الدخول** وأنشئ حسابًا بالبريد الإلكتروني وكلمة المرور. قد يطلب Supabase تأكيد البريد حسب إعدادات المشروع.
7. أضف مهمة أو تسليمًا، ثم تحقق أن المزامنة ظهرت. افتح الموقع من جهاز آخر وسجّل الدخول بالحساب نفسه.

## ملاحظات
- الإعدادات تحفظ في المتصفح. يجب إدخالها مرة واحدة لكل متصفح/جهاز.
- بيانات التطبيق محفوظة في localStorage كنسخة محلية أيضًا، ثم تتم مزامنتها إلى صف يخص المستخدم في Supabase.
- استخدم فقط publishable/anon key بالواجهة، مع RLS مفعّلًا كما في SQL أعلاه.
- النسخة لا تزال نموذجًا بسيطًا؛ الأدوار التفصيلية للمدير والموظفين والصلاحيات المتقدمة تحتاج تطويرًا إضافيًا.
