# Tauri finds the plugin class by name and dispatches @Command methods and
# @ActivityCallback handlers by reflection; argument classes are filled by
# Jackson. The service is started by class name from the manifest.
-keep class com.nzaplabs.mobile.NzapMobilePlugin { *; }
-keep class com.nzaplabs.mobile.KeepAliveService { *; }
-keep class com.nzaplabs.mobile.*Args { *; }
