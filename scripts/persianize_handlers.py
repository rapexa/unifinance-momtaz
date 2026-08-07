#!/usr/bin/env python3
"""Persianize common English handler error strings (in-place)."""
from pathlib import Path

REPLACEMENTS = [
    ('"failed to list students"', '"خطا در دریافت لیست دانش‌آموزان"'),
    ('"student not found"', '"دانش‌آموز یافت نشد"'),
    ('"invalid id"', '"شناسه نامعتبر است"'),
    ('"school_contract_id is required for school registration"', '"برای ثبت‌نام مدرسه‌ای، انتخاب قرارداد مدرسه الزامی است"'),
    ('"delivery_mode is required (ONLINE or IN_PERSON)"', '"نحوه برگزاری (آنلاین یا حضوری) الزامی است"'),
    ('"failed to create student"', '"ثبت دانش‌آموز با خطا مواجه شد"'),
    ('"failed to update student"', '"ویرایش دانش‌آموز با خطا مواجه شد"'),
    ('"failed to list payments"', '"خطا در دریافت لیست پرداخت‌ها"'),
    ('"payment not found"', '"پرداخت یافت نشد"'),
    ('"failed to get payment summary"', '"خطا در دریافت خلاصه پرداخت‌ها"'),
    ('"failed to create payment"', '"ثبت پرداخت با خطا مواجه شد"'),
    ('"failed to update payment"', '"ویرایش پرداخت با خطا مواجه شد"'),
    ('"failed to delete payment"', '"حذف پرداخت با خطا مواجه شد"'),
    ('"failed to load reports summary"', '"خطا در دریافت خلاصه گزارش‌ها"'),
    ('"failed to load revenue series"', '"خطا در دریافت نمودار درآمد"'),
    ('"failed to load payroll series"', '"خطا در دریافت نمودار حقوق"'),
    ('"failed to load payment details"', '"خطا در دریافت جزئیات پرداخت‌ها"'),
    ('"failed to load revenue by student"', '"خطا در دریافت درآمد به تفکیک دانش‌آموز"'),
    ('"failed to load payroll lines"', '"خطا در دریافت جزئیات حقوق"'),
    ('"failed to load payroll by user"', '"خطا در دریافت حقوق به تفکیک کارمند"'),
    ('"failed to load student debts"', '"خطا در دریافت بدهی دانش‌آموزان"'),
    ('"failed to load advisor debts"', '"خطا در دریافت بدهی مشاوران"'),
    ('"invalid month; expected YYYY-MM"', '"فرمت ماه نامعتبر است"'),
    ('"invalid from; expected YYYY-MM"', '"تاریخ شروع نامعتبر است"'),
    ('"invalid to; expected YYYY-MM"', '"تاریخ پایان نامعتبر است"'),
    ('"to must be greater than or equal to from"', '"تاریخ پایان باید بعد از شروع باشد"'),
    ('"failed to load organization settings"', '"خطا در دریافت تنظیمات سازمان"'),
    ('"failed to update organization settings"', '"خطا در ذخیره تنظیمات سازمان"'),
    ('"failed to load profile"', '"خطا در دریافت پروفایل"'),
    ('"avatar file is required"', '"انتخاب تصویر الزامی است"'),
    ('"invalid image type; use jpg, png, gif or webp"', '"فرمت تصویر نامعتبر است؛ از jpg، png، gif یا webp استفاده کنید"'),
    ('"failed to save avatar"', '"ذخیره تصویر با خطا مواجه شد"'),
    ('"failed to update profile"', '"ذخیره پروفایل با خطا مواجه شد"'),
    ('"email already exists"', '"این ایمیل قبلاً ثبت شده است"'),
    ('"current password is incorrect"', '"رمز عبور فعلی نادرست است"'),
    ('"new password is too short"', '"رمز عبور جدید کوتاه است"'),
    ('"failed to change password"', '"تغییر رمز عبور با خطا مواجه شد"'),
    ('"failed to update 2FA setting"', '"خطا در تنظیم احراز هویت دو مرحله‌ای"'),
    ('"failed to load notifications settings"', '"خطا در دریافت تنظیمات اعلان‌ها"'),
    ('"failed to update notifications settings"', '"خطا در ذخیره تنظیمات اعلان‌ها"'),
    ('"failed to load payment settings"', '"خطا در دریافت تنظیمات پرداخت"'),
    ('"failed to update payment settings"', '"خطا در ذخیره تنظیمات پرداخت"'),
    ('"missing user in context"', '"نشست نامعتبر است. دوباره وارد شوید."'),
    ('"invalid user id type"', '"نشست نامعتبر است. دوباره وارد شوید."'),
    ('"failed to load dashboard KPIs"', '"خطا در دریافت شاخص‌های داشبورد"'),
    ('"failed to load recent payments"', '"خطا در دریافت پرداخت‌های اخیر"'),
    ('"failed to load debt alerts"', '"خطا در دریافت هشدار بدهی‌ها"'),
    ('"failed to load revenue trend"', '"خطا در دریافت روند درآمد"'),
    ('"failed to list roles"', '"خطا در دریافت نقش‌ها"'),
    ('"role not found"', '"نقش یافت نشد"'),
    ('"role code already exists"', '"کد نقش تکراری است"'),
    ('"cannot delete system role"', '"نقش سیستمی قابل حذف نیست"'),
    ('"name is required"', '"نام الزامی است"'),
    ('"failed to list school contracts"', '"خطا در دریافت قراردادهای مدرسه"'),
    ('"school contract not found"', '"قرارداد مدرسه یافت نشد"'),
    ('"failed to create school contract"', '"ثبت قرارداد مدرسه با خطا مواجه شد"'),
    ('"failed to update school contract"', '"ویرایش قرارداد مدرسه با خطا مواجه شد"'),
    ('"failed to delete school contract"', '"حذف قرارداد مدرسه با خطا مواجه شد"'),
    ('"plan not found"', '"پلن یافت نشد"'),
    ('"failed to list plans"', '"خطا در دریافت لیست پلن‌ها"'),
    ('"failed to create plan"', '"ثبت پلن با خطا مواجه شد"'),
    ('"failed to update plan"', '"ویرایش پلن با خطا مواجه شد"'),
    ('"failed to list users"', '"خطا در دریافت لیست کاربران"'),
    ('"user not found"', '"کاربر یافت نشد"'),
    ('"failed to create user"', '"ثبت کاربر با خطا مواجه شد"'),
    ('"failed to update user"', '"ویرایش کاربر با خطا مواجه شد"'),
    ('"failed to deactivate user"', '"غیرفعال‌سازی کاربر با خطا مواجه شد"'),
    ('"failed to export users"', '"خروجی کاربران با خطا مواجه شد"'),
    ('"failed to get users summary"', '"خطا در دریافت خلاصه کاربران"'),
]


def main() -> None:
    root = Path("backend/handlers")
    for p in root.glob("*.go"):
        if p.name in ("httperr.go", "auth_handler.go"):
            continue
        text = p.read_text(encoding="utf-8")
        orig = text
        for eng, fa in REPLACEMENTS:
            text = text.replace(eng, fa)
        if text != orig:
            p.write_text(text, encoding="utf-8")
            print("updated", p.name)
        else:
            print("unchanged", p.name)


if __name__ == "__main__":
    main()
