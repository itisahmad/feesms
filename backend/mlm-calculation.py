# MLM Rank Income Calculator

# ==============================
# Rank Configuration
# ==============================
RANKS = [
    {"rank": 1, "required": 2, "reward": {"low": 800, "mid": 800, "high": 800}},
    {"rank": 2, "required": 8, "reward": {"low": 1600, "mid": 1600, "high": 1600}},
    {"rank": 3, "required": 16, "reward": {"low": 6400, "mid": 6400, "high": 6400}},
    {"rank": 4, "required": 64, "reward": {"low": 25600, "mid": 25600, "high": 25600}},
    {"rank": 5, "required": 256, "reward": {"low": 51200, "mid": 76800, "high": 102400}},
    {"rank": 6, "required": 1024, "reward": {"low": 81920, "mid": 122880, "high": 163840}},
    {"rank": 7, "required": 4096, "reward": {"low": 327680, "mid": 491520, "high": 655360}},
    {"rank": 8, "required": 16384, "reward": {"low": 1301440, "mid": 1952160, "high": 2602880}},
    {"rank": 9, "required": 65536, "reward": {"low": 5242880, "mid": 7864320, "high": 10485760}},
]


# ==============================
# Core Functions
# ==============================

def get_valid_units(left_count, right_count):
    """Apply one-leg rule"""
    return min(left_count, right_count)


def get_rank(units):
    """Determine highest rank"""
    for r in reversed(RANKS):
        if units >= r["required"]:
            return r
    return None


def calculate_income(user):
    """
    user = {
        "left_count": int,
        "right_count": int,
        "plan": "low" | "mid" | "high",
        "booster_active": bool
    }
    """

    left = user["left_count"]
    right = user["right_count"]
    plan = user["plan"]
    booster = user.get("booster_active", False)

    # Step 1: valid units
    units = get_valid_units(left, right)

    # Step 2: find rank
    rank_data = get_rank(units)

    if not rank_data:
        return {
            "rank": 0,
            "income": 0,
            "units_used": 0,
            "carry_forward": units
        }

    rank = rank_data["rank"]
    required = rank_data["required"]

    # Step 3: booster check (from rank 5)
    if rank >= 5 and not booster:
        return {
            "rank": rank,
            "income": 0,
            "units_used": 0,
            "carry_forward": units,
            "message": "Booster required for this rank"
        }

    # Step 4: income
    income = rank_data["reward"][plan]

    # Step 5: carry forward
    carry_forward = units - required

    return {
        "rank": rank,
        "income": income,
        "units_used": required,
        "carry_forward": carry_forward
    }


# ==============================
# Test Cases
# ==============================

def run_tests():
    users = [
        {
            "name": "User 1",
            "left_count": 10,
            "right_count": 9,
            "plan": "low",
            "booster_active": True
        },
        {
            "name": "User 2",
            "left_count": 300,
            "right_count": 280,
            "plan": "mid",
            "booster_active": True
        },
        {
            "name": "User 3 (No Booster)",
            "left_count": 300,
            "right_count": 280,
            "plan": "high",
            "booster_active": False
        },
        {
            "name": "User 4 (Big Network)",
            "left_count": 5000,
            "right_count": 4500,
            "plan": "high",
            "booster_active": True
        }
    ]

    for user in users:
        print(f"\n===== {user['name']} =====")
        result = calculate_income(user)
        print(f"Left: {user['left_count']}, Right: {user['right_count']}")
        print(f"Plan: {user['plan']}")
        print("Result:", result)


# ==============================
# Run Script
# ==============================

if __name__ == "__main__":
    print('before running the script')
    run_tests()