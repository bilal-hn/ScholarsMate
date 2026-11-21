import litellm

litellm.modify_params = True
litellm.drop_params = True

models = [
    "us.deepseek.r1-v1:0",
    "us.amazon.nova-micro-v1:0",
    "us.amazon.nova-lite-v1:0",
    "us.meta.llama3-1-8b-instruct-v1:0",
    "amazon.titan-text-express-v1",
    "cohere.command-r-v1:0",
]

print("\n=== TESTING AWS BEDROCK MODELS VIA IAM ROLE ===\n")
for m in models:
    try:
        res = litellm.completion(
            model="bedrock/" + m,
            messages=[{"role": "user", "content": "Hello"}],
            aws_region_name="us-east-1",
            max_tokens=15,
        )
        print(f"✅ AVAILABLE: bedrock/{m}")
    except Exception as e:
        err = str(e)
        if "Too many tokens" in err:
            print(f"❌ QUOTA CAPPED (0 TPD): bedrock/{m}")
        else:
            print(f"⚠️ ERROR: bedrock/{m} -> {err[:90]}...")
