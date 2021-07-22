use anyhow::{Context, Result};
use serde_json::Value as JsonValue;
use toml::Value as TomlValue;

fn camel_case(source: &str) -> String {
    let mut dest = String::with_capacity(source.len());
    let mut capitalize = false;
    for ch in source.chars() {
        if ch == ' ' || ch == '_' {
            capitalize = true;
        } else if capitalize {
            dest.push(ch.to_ascii_uppercase());
            capitalize = false;
        } else {
            dest.push(ch);
        }
    }
    dest[..1].to_ascii_lowercase() + &dest[1..]
}

fn convert(toml_value: TomlValue) -> JsonValue {
    match toml_value {
        TomlValue::Array(arr) => JsonValue::Array(arr.into_iter().map(convert).collect()),
        TomlValue::Boolean(b) => JsonValue::Bool(b),
        TomlValue::Datetime(dt) => JsonValue::String(dt.to_string()),
        TomlValue::Float(f) => match serde_json::Number::from_f64(f) {
            Some(n) => JsonValue::Number(n),
            None => JsonValue::Null,
        },
        TomlValue::Integer(i) => JsonValue::Number(i.into()),
        TomlValue::String(s) => JsonValue::String(s),
        TomlValue::Table(table) => JsonValue::Object(
            table
                .into_iter()
                .map(|(k, v)| (camel_case(&k), convert(v)))
                .collect(),
        ),
    }
}

pub fn toml_to_json(source: &str) -> Result<String> {
    let toml = source.parse().context("failed to parse TOML")?;
    let json = serde_json::to_string(&convert(toml)).context("failed serializing JSON")?;
    Ok(json)
}

#[cfg(test)]
mod tests {
    use std::env;
    use std::fs;
    use std::path::Path;

    #[test]
    fn camel_case() {
        fn t(src: &str, exp: &str) {
            assert_eq!(super::camel_case(src), exp.to_string());
        }

        t("oneword", "oneword");
        t("camelCase", "camelCase");
        t("space separated", "spaceSeparated");
        t("underscore_separated", "underscoreSeparated");
        t("multiple   spaces", "multipleSpaces");
        t("   spaces_underscores_mixed", "spacesUnderscoresMixed");
    }

    #[test]
    fn convert_snapshot() {
        let toml_file = Path::new(file!()).parent().unwrap().join("test.toml");
        let toml_data = fs::read_to_string(toml_file).unwrap();
        insta::assert_yaml_snapshot!(super::convert(toml_data.parse().unwrap()));
    }
}
