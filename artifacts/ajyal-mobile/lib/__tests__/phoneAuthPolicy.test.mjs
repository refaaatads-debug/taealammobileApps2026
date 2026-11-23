import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSaudiMobile, assertSamePhoneAccount, validatePhoneOtp } from '../phoneAuthPolicy.ts';
test('normalizes Saudi national and international phone formats', () => {
 for (const value of ['0501234567', '501234567', '+966501234567', '00966501234567', '٠٥٠١٢٣٤٥٦٧']) assert.equal(normalizeSaudiMobile(value), '+966501234567');
});
test('rejects invalid and non-Saudi mobile numbers', () => {
 for (const value of ['', '+15551234567', '+966123456789', '050123456', '05012345678', 'abc']) assert.throws(() => normalizeSaudiMobile(value));
});
test('phone linking cannot follow a different account', () => {
 assert.doesNotThrow(() => assertSamePhoneAccount('user-a','user-a'));
 for (const value of ['user-b', undefined, '']) assert.throws(() => assertSamePhoneAccount('user-a',value));
 assert.throws(() => assertSamePhoneAccount('',''));
});
test('requires exactly six digits and supports Arabic digits', () => {
 assert.equal(validatePhoneOtp('١٢٣٤٥٦'),'123456');
 for (const value of ['', '12345', '1234567','abcdef']) assert.throws(() => validatePhoneOtp(value));
});
