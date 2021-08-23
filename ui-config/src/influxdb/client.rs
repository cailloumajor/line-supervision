use std::{collections::HashMap, sync::Arc};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use surf::{Client as HttpClient, Response, Result as HttpResult};

use super::flux_query::{FluxValue, QueryBuilder};
use crate::config::Config;

#[derive(Serialize)]
struct QueryParams<'a> {
    org: &'a str,
}

#[derive(Default, Deserialize)]
struct InfluxdbErrorResponse {
    message: String,
}

#[derive(Clone)]
pub struct Client {
    read_token: Arc<String>,
    org: Arc<String>,
    bucket: Arc<String>,
    query_builder: Arc<QueryBuilder>,
    client: HttpClient,
}

impl Client {
    pub fn new(config: &Config) -> Self {
        let mut http_client = HttpClient::new();
        http_client.set_base_url(config.influxdb_base_url.to_owned().into());
        Client {
            read_token: Arc::new(config.influxdb_read_token.to_owned()),
            org: Arc::new(config.influxdb_org.to_owned()),
            bucket: Arc::new(config.influxdb_bucket.to_owned()),
            query_builder: Arc::new(QueryBuilder::new()),
            client: http_client,
        }
    }

    pub async fn ready(&self) -> HttpResult {
        self.client.get("ready").send().await
    }

    pub async fn flux_query(
        &self,
        template: &'static str,
        mut params: HashMap<&'static str, FluxValue>,
    ) -> Result<Response> {
        params.insert("bucket", self.bucket.to_string().into());
        let flux = self.query_builder.generate_query(template, params).unwrap();
        let mut influxdb_resp = self
            .client
            .post("api/v2/query")
            .query(&QueryParams { org: &self.org })
            .map_err(|e| e.into_inner())?
            .content_type("application/vnd.flux")
            .header("Accept", "application/csv")
            .header("Authorization", format!("Token {}", self.read_token))
            .body(flux)
            .send()
            .await
            .map_err(|e| e.into_inner())?;
        if influxdb_resp.status().is_success() {
            Ok(influxdb_resp)
        } else {
            let InfluxdbErrorResponse { message } =
                influxdb_resp.body_json().await.unwrap_or_default();
            Err(anyhow!("error response from InfluxDB: {}", message))
        }
    }
}