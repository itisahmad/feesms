# Database Schema

This file is the single place to document the backend data model for `SchoolFee Pro`.

Update this document whenever you:

- add or remove a model
- change a relationship
- add a unique constraint
- change important lifecycle behavior around fees, payments, budgets, or subscriptions

## Database Engine

- Local development currently uses SQLite in `backend/db.sqlite3`
- Production is configured to use PostgreSQL via `DATABASE_URL`

## Core Model Groups

- Tenant and identity: `School`, `User`, `Subscription`
- Academic structure: `SchoolClass`, `Section`, `Student`
- Fees and collections: `FeeType`, `FeeStructure`, `StudentFeeStructureChoice`, `StudentFee`, `FeePayment`
- Expense management: `ExpenseCategory`, `Vendor`, `Expense`, `Budget`

## Relationship Overview

```text
School
├── staff -> User (1 to many)
├── subscription -> Subscription (1 to 1)
├── classes -> SchoolClass (1 to many)
├── students -> Student (1 to many)
├── fee_types -> FeeType (1 to many)
├── fee_structures -> FeeStructure (1 to many)
├── expense_categories -> ExpenseCategory (1 to many)
├── vendors -> Vendor (1 to many)
├── expenses -> Expense (1 to many)
└── budgets -> Budget (1 to many)

SchoolClass
├── belongs to -> School
├── sections -> Section (1 to many)
├── students -> Student (1 to many)
└── fee_structures -> FeeStructure (1 to many)

Student
├── belongs to -> School
├── belongs to -> SchoolClass (optional)
├── belongs to -> Section (optional)
├── fee_structure_choices -> StudentFeeStructureChoice (1 to many)
└── fees -> StudentFee (1 to many)

FeeType
├── belongs to -> School (optional for system/global fee types)
└── structures -> FeeStructure (1 to many)

FeeStructure
├── belongs to -> School
├── belongs to -> FeeType
├── belongs to -> SchoolClass (optional)
├── student_choices -> StudentFeeStructureChoice (1 to many)
└── student_fees -> StudentFee (1 to many)

StudentFee
├── belongs to -> Student
├── belongs to -> FeeStructure
└── payments -> FeePayment (1 to many)

Expense
├── belongs to -> School
├── belongs to -> ExpenseCategory (nullable)
├── belongs to -> Vendor (nullable)
└── created_by -> User (nullable)

Budget
├── belongs to -> School
└── belongs to -> ExpenseCategory
```

## Model Reference

### `User`

Purpose:
- Custom auth model for school owners and staff users.

Key fields:
- `role`: `owner`, `accountant`, `staff`
- `phone`
- `school` -> `School` (nullable for edge cases)

Relationships:
- many `User` records belong to one `School`

Notes:
- `AUTH_USER_MODEL = 'schools.User'`
- school owners and staff are stored in the same table

### `School`

Purpose:
- Top-level tenant model for every institution.

Key fields:
- `name`, `address`, `city`, `state`
- `plan`
- `max_students`
- `max_staff_logins`
- `academic_year_start_month`
- `trial_ends_at`

Relationships:
- one `School` has many `User`, `SchoolClass`, `Student`, `FeeType`, `FeeStructure`, `ExpenseCategory`, `Vendor`, `Expense`, `Budget`
- one `School` has one `Subscription`

Notes:
- most business data is tenant-scoped through `School`

### `SchoolClass`

Purpose:
- Defines class/grade structure inside a school.

Key fields:
- `school`
- `name`
- `display_order`

Relationships:
- many classes belong to one `School`
- one class has many `Section`
- one class has many `Student`
- one class has many `FeeStructure`

Constraints:
- unique together: `school`, `name`

### `Section`

Purpose:
- Stores sections inside a class like `A`, `B`, `C`.

Key fields:
- `school_class`
- `name`
- `display_order`

Relationships:
- many sections belong to one `SchoolClass`
- one section has many `Student`

Constraints:
- unique together: `school_class`, `name`

### `Student`

Purpose:
- Student master record.

Key fields:
- `school`
- `school_class` (nullable)
- `section` (nullable)
- `name`
- `parent_name`, `parent_phone`, `parent_email`
- `admission_number`, `roll_number`
- `admission_date`
- `charges_effective_from`
- `is_active`

Relationships:
- many students belong to one `School`
- many students may belong to one `SchoolClass`
- many students may belong to one `Section`
- one student has many `StudentFeeStructureChoice`
- one student has many `StudentFee`

Legacy fields:
- `class_name`
- `section_legacy`
- `uses_transport`

### `FeeType`

Purpose:
- Defines logical fee buckets like tuition, transport, exam fee.

Key fields:
- `school` (nullable)
- `name`
- `is_system`
- `description`
- `billing_period`

Billing periods:
- `monthly`
- `quarterly`
- `half_yearly`
- `yearly`
- `one_time`

Relationships:
- many fee types can belong to one `School`
- one fee type has many `FeeStructure`

Notes:
- `school = null` and `is_system = true` means global/system fee type
- newly created schools also get school-specific default fee types seeded automatically

### `FeeStructure`

Purpose:
- Stores the actual amount of a fee type for a class and academic year.

Key fields:
- `school`
- `fee_type`
- `school_class` (nullable)
- `amount`
- `due_day`
- `late_fine_per_day`
- `academic_year`
- `allow_yearly_payment`
- `yearly_discount_percent`

Relationships:
- many fee structures belong to one `School`
- many fee structures belong to one `FeeType`
- many fee structures may belong to one `SchoolClass`
- one fee structure has many `StudentFeeStructureChoice`
- one fee structure has many `StudentFee`

Constraints:
- unique together: `school`, `fee_type`, `school_class`, `academic_year`

Lifecycle notes:
- billing frequency is controlled by `fee_type.billing_period`
- `should_bill_for_month()` decides if a structure should generate for a month

### `StudentFeeStructureChoice`

Purpose:
- Links a student to the fee structures that actually apply.

Key fields:
- `student`
- `fee_structure`
- `effective_from`

Relationships:
- many choices belong to one `Student`
- many choices belong to one `FeeStructure`

Constraints:
- unique together: `student`, `fee_structure`

Notes:
- used to support optional fees like transport starting later

### `StudentFee`

Purpose:
- Generated fee record for a student for a month/year and fee structure.

Key fields:
- `student`
- `fee_structure`
- `month`
- `year`
- `amount`
- `late_fine`
- `total_amount`
- `due_date`

Relationships:
- many student fee rows belong to one `Student`
- many student fee rows belong to one `FeeStructure`
- one student fee has many `FeePayment`

Constraints:
- unique together: `student`, `fee_structure`, `month`, `year`

Notes:
- this is the main table for dues, pending amounts, and collection summaries

### `FeePayment`

Purpose:
- Stores payment transactions against a single `StudentFee`.

Key fields:
- `student_fee`
- `amount`
- `discount`
- `payment_date`
- `payment_mode`
- `transaction_id`
- `receipt_number`
- `notes`
- `created_by` -> `User` (nullable)

Relationships:
- many payments belong to one `StudentFee`
- many payments may be created by one `User`

Notes:
- multiple partial payments can exist against the same `StudentFee`

### `Subscription`

Purpose:
- Stores subscription/trial lifecycle for a school.

Key fields:
- `school`
- `plan`
- `status`
- `razorpay_subscription_id`
- `razorpay_customer_id`
- `current_period_start`
- `current_period_end`

Relationships:
- one subscription belongs to exactly one `School`

Constraint:
- one-to-one with `School`

### `ExpenseCategory`

Purpose:
- Custom school-specific expense grouping.

Key fields:
- `school`
- `name`
- `description`
- `color`
- `icon`
- `is_active`

Relationships:
- many categories belong to one `School`
- one category has many `Expense`
- one category has many `Budget`

Constraints:
- unique together: `school`, `name`

### `Vendor`

Purpose:
- Supplier/vendor master records.

Key fields:
- `school`
- `name`
- `contact_person`
- `phone`
- `email`
- `address`
- `gst_number`
- `pan_number`
- `payment_terms`
- `is_active`

Relationships:
- many vendors belong to one `School`
- one vendor has many `Expense`

### `Expense`

Purpose:
- Individual expense transaction.

Key fields:
- `school`
- `category` (nullable)
- `vendor` (nullable)
- `title`
- `description`
- `amount`
- `date`
- `payment_mode`
- `reference_number`
- `receipt`
- `tags`
- `is_recurring`
- `recurring_interval`
- `recurring_end_date`
- `created_by` -> `User` (nullable)

Relationships:
- many expenses belong to one `School`
- many expenses may belong to one `ExpenseCategory`
- many expenses may belong to one `Vendor`
- many expenses may be created by one `User`

### `Budget`

Purpose:
- Planned spending by category and academic year.

Key fields:
- `school`
- `category`
- `academic_year`
- `planned_amount`
- `alert_threshold_percentage`
- `notes`

Relationships:
- many budgets belong to one `School`
- many budgets belong to one `ExpenseCategory`

Constraints:
- unique together: `school`, `category`, `academic_year`

Computed properties:
- `spent_amount`
- `remaining_amount`
- `utilization_percentage`

## Important Data Rules

- All school data is tenant-scoped through `School`
- `FeeType` can be global (`school = null`) or school-specific
- `StudentFeeStructureChoice` decides which fee structures apply to each student
- `StudentFee` stores generated monthly/periodic dues
- `FeePayment` stores actual collections and supports partial payments
- Expense and budget modules are also school-scoped

## Recommended Update Checklist

When schema changes happen, update this file with:

1. new or removed models
2. new foreign keys or one-to-one relations
3. changed nullable behavior
4. new unique constraints
5. billing or fee-generation lifecycle changes
6. important deprecated fields
