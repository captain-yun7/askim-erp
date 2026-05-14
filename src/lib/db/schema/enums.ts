import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'accountant',
  'sales',
  'viewer',
])

export const dealStatusEnum = pgEnum('deal_status', [
  'draft',
  'confirmed',
  'closed',
])

export const paidStatusEnum = pgEnum('paid_status', [
  'pending',
  'partial',
  'completed',
])

export const paymentMethodEnum = pgEnum('payment_method', [
  'corporate_card',
  'personal_card',
  'cash',
  'bank_transfer',
])
