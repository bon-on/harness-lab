plugins {
  kotlin("jvm") version "2.0.0"
  kotlin("plugin.spring") version "2.0.0"
  id("org.springframework.boot") version "3.3.0"
}

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.test {
  useJUnitPlatform()
}
