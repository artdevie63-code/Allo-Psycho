import hashlib, secrets
alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
def part(): return "".join(secrets.choice(alphabet) for _ in range(4))
code=f"AP-{part()}-{part()}"
h=hashlib.sha256(code.encode()).hexdigest()
print("Code à remettre au client:",code)
print("SQL à exécuter dans Supabase:")
print(f"insert into public.premium_codes(code_hash,duration_days) values ('{h}',31);")
