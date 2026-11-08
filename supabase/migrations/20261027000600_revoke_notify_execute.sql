-- New functions get EXECUTE for PUBLIC by default; app.* functions are not for anon.
revoke execute on function app.notify_change() from public, anon;
