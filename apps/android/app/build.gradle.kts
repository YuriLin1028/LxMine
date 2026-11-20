import java.util.zip.ZipFile
import java.security.MessageDigest

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Explicit local-only opt-in; ordinary builds never add this generated asset.
val privateTestSources = providers.gradleProperty("lxmine.privateTestSources").orNull?.let { file(it) }
val privateTestSourcesHash = privateTestSources?.let {
    check(it.isFile) { "Missing private test source snapshot" }
    MessageDigest.getInstance("SHA-256").digest(it.readBytes()).joinToString("") { byte -> "%02x".format(byte) }
}.orEmpty()

android {
    namespace = "com.lxlia.player"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.lxlia.player"
        minSdk = 26
        targetSdk = 35
        versionCode = 13
        versionName = "1.2.1"
        vectorDrawables { useSupportLibrary = true }
        buildConfigField("String", "PRIVATE_TEST_SOURCES_SHA256", "\"$privateTestSourcesHash\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            applicationIdSuffix = ".debug"
            // 与鸿蒙 cn.migu.music 共存安装时不冲突，也便于区分调试包。
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }


    buildFeatures { compose = true; buildConfig = true }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
        jniLibs { useLegacyPackaging = false }
    }

    androidResources {
        ignoreAssetsPattern = "sources:dev-source.js:lx-sources-default.json"
        // 舞台资源保持原样打进 assets。
        noCompress += listOf("js", "html", "json", "css")
    }
}

privateTestSources?.let { snapshot ->
    val generatedAssets = layout.buildDirectory.dir("generated/private-test-assets")
    val preparePrivateTestSources = tasks.register<Copy>("preparePrivateTestSources") {
        from(snapshot) { rename { "private-test-sources.json" } }
        into(generatedAssets)
    }
    android.sourceSets.getByName("main").assets.srcDir(generatedAssets)
    tasks.named("preBuild").configure { dependsOn(preparePrivateTestSources) }
}

tasks.matching { it.name == "assembleDebug" || it.name == "assembleRelease" }.configureEach {
    doLast {
        val variant = name.removePrefix("assemble").lowercase()
        val outputDirectory = layout.buildDirectory.dir("outputs/apk/$variant").get().asFile
        val apks = outputDirectory.walkTopDown().filter { it.isFile && it.extension == "apk" }.toList()
        val sourceAsset = Regex("(?:^|/)(?:sources/|dev-source\\.js$|lx-sources-default\\.json$)")
        check(apks.isNotEmpty()) { "Missing APK output for $variant" }
        apks.forEach { apk ->
            ZipFile(apk).use { archive ->
                val bundledSources = archive.entries().asSequence().filter { entry ->
                    !entry.isDirectory && sourceAsset.containsMatchIn(entry.name)
                }.map { it.name }.toList()
                check(bundledSources.isEmpty()) { "APK contains bundled music sources: $bundledSources" }
                val privateAsset = archive.getEntry("assets/private-test-sources.json")
                check((privateAsset != null) == (privateTestSources != null)) { "Unexpected private test source asset" }
                if (privateAsset != null) {
                    val actualHash = MessageDigest.getInstance("SHA-256")
                        .digest(archive.getInputStream(privateAsset).use { it.readBytes() })
                        .joinToString("") { byte -> "%02x".format(byte) }
                    check(actualHash == privateTestSourcesHash) { "Private test source snapshot mismatch" }
                }
            }
        }
    }
}

dependencies {
    // 液态玻璃库 backdrop 2.0.0 要求 Compose 1.11；1.11.4 只要求 compileSdk 35。

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.compose.ui:ui:1.11.4")
    implementation("androidx.compose.ui:ui-graphics:1.11.4")
    implementation("androidx.compose.foundation:foundation:1.11.4")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.compose.ui:ui-tooling-preview:1.11.4")
    debugImplementation("androidx.compose.ui:ui-tooling:1.11.4")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")

    implementation("androidx.media3:media3-exoplayer:1.6.1")
    implementation("androidx.media3:media3-session:1.6.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.6.1")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("io.coil-kt:coil-svg:2.7.0")
    // 安卓版液态玻璃（Backdrop / Liquid Glass，Apache-2.0）
    implementation("io.github.kyant0:backdrop:1.0.6")
    implementation("androidx.palette:palette-ktx:1.0.0")
    implementation("androidx.webkit:webkit:1.13.0")

    testImplementation("junit:junit:4.13.2")
    // 单元测试用真实 org.json（Android SDK 里的 org.json 在 JVM 上是空实现）。
    testImplementation("org.json:json:20240303")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
