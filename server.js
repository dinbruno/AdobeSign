const express = require("express");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
const port = 3000;

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const clientId = "CBJCHBCAABAAciyBekI2WMBDUg9HuizZWGVCYRJeEs3I";
const clientSecret = "eDAeXDbYDZIl-doUppN2XSBUyWuaUBPZ";
const widgetTemplateId = "CBJCHBCAABAANe1d0j51DcNP1n7A14aGWjDBJCE9djMy";
const refreshKey = "3AAABLblqZhA0IN2zr845TsYEbQAEGntTqEb0HMEix3PIbv4DynOR1trITLUZi3YwuB2iOVZX_do*";

async function fetchNewAccessToken() {
  try {
    const params = `grant_type=refresh_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(
      clientSecret
    )}&refresh_token=${encodeURIComponent(refreshKey)}`;

    const response = await axios.post("https://api.na3.adobesign.com/oauth/v2/refresh", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("Access token obtido com sucesso.", response.data.access_token);

    return response.data.access_token;
  } catch (error) {
    console.error("Erro ao obter access token:", error.response?.data || error.message);
    throw new Error("Erro ao obter o token de acesso.");
  }
}

// Função para obter o URI base da Adobe Sign
async function getBaseUri() {
  const accessToken = await fetchNewAccessToken();

  if (!accessToken) {
    throw new Error("Falha ao obter o token de acesso.");
  }

  try {
    const response = await axios.get("https://api.na3.adobesign.com/api/rest/v6/baseUris", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data.apiAccessPoint;
  } catch (error) {
    console.error("Erro ao obter o URI base:", error);
    return null;
  }
}

// Função para criar um widget
async function createWidget(templateId, baseUri) {
  const widgetData = {
    fileInfos: [{ libraryDocumentId: templateId }],
    name: "Contrata Fast",
    state: "ACTIVE",
    widgetParticipantSetInfo: {
      memberInfos: [
        {
          email: "",
          securityOption: { authenticationMethod: "NONE" },
        },
      ],
      role: "SIGNER",
    },
    securityOption: { openPassword: "" },
  };

  const accessToken = await fetchNewAccessToken();

  if (!accessToken) {
    throw new Error("Falha ao obter o token de acesso.");
  }

  try {
    const response = await axios.post(`${baseUri}/api/rest/v6/widgets`, widgetData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Erro ao criar o widget:", error);
    return null;
  }
}

// Função para obter todos os widgets
async function getAllWidgets(baseUri) {
  const accessToken = await fetchNewAccessToken();

  if (!accessToken) {
    throw new Error("Falha ao obter o token de acesso.");
  }

  try {
    const response = await axios.get(`${baseUri}/api/rest/v6/widgets`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Erro ao obter todos os widgets:", error);
    return null;
  }
}

// Função para verificar o status do widget
async function checkWidgetStatus(widgetId, baseUri) {
  const accessToken = await fetchNewAccessToken();

  if (!accessToken) {
    throw new Error("Falha ao obter o token de acesso.");
  }

  try {
    const response = await axios.get(`${baseUri}/api/rest/v6/widgets/${widgetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data.status === "ACTIVE";
  } catch (error) {
    console.error("Erro ao verificar o status do widget:", error);
    return false;
  }
}

// Função para baixar o documento assinado
async function downloadSignedDocument(req, res, widgetId, baseUri) {
  const accessToken = await fetchNewAccessToken();

  if (!accessToken) {
    throw new Error("Falha ao obter o token de acesso.");
  }

  try {
    const agreementStatus = await axios.get(`${baseUri}/api/rest/v6/widgets/${widgetId}/agreements`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (agreementStatus.data.userAgreementList[0].status !== "SIGNED") {
      res.status(400).send("Documento ainda não foi assinado.");
      return;
    }

    const response = await axios.get(`${baseUri}/api/rest/v6/agreements/${agreementStatus.data.userAgreementList[0].id}/documents`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const getDocumentById = await axios.get(
      `${baseUri}/api/rest/v6/agreements/${agreementStatus.data.userAgreementList[0].id}/documents/${response.data.documents[0].id}`,
      {
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    res.setHeader("Content-Disposition", 'attachment; filename="signed_document.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.send(getDocumentById.data);
  } catch (error) {
    console.error("Erro ao baixar o documento assinado:", error.message);
    res.status(500).send("Erro ao baixar o documento assinado.");
  }
}

// Rota para criar e verificar widget
app.get("/run", async (req, res) => {
  try {
    const baseUri = await getBaseUri();

    if (!baseUri) {
      res.status(500).send("Falha ao obter o URI base.");
      return;
    }

    const widgetResponse = await createWidget(widgetTemplateId, baseUri);
    if (!widgetResponse) {
      res.status(500).send("Falha ao criar o widget.");
      return;
    }

    let isActive = false;
    for (let i = 0; i < 5; i++) {
      isActive = await checkWidgetStatus(widgetResponse.id, baseUri);
      if (isActive) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    if (!isActive) {
      res.status(500).send("O widget não está ativo ou não tem páginas disponíveis.");
      return;
    }

    const allWidgets = await getAllWidgets(baseUri);
    if (!allWidgets) {
      res.status(500).send("Falha ao obter todos os widgets.");
      return;
    }

    const filteredWidget = allWidgets.userWidgetList.find((widget) => widget.id === widgetResponse.id);

    if (!filteredWidget) {
      res.status(500).send("Widget ID não encontrado na lista de todos os widgets.");
      return;
    }

    res.send({
      widgetId: widgetResponse.id,
      iframeEmbedCode: filteredWidget.url,
    });
  } catch (error) {
    console.error("Erro durante o processamento:", error);
    res.status(500).send(error.message || "Erro interno do servidor.");
  }
});

// Rota para baixar o documento assinado
app.get("/:id/document", async (req, res) => {
  try {
    const baseUri = await getBaseUri();
    if (!baseUri) {
      res.status(500).send("Falha ao obter o URI base.");
      return;
    }

    await downloadSignedDocument(req, res, req.params.id, baseUri);
  } catch (error) {
    console.error("Erro durante o processamento:", error);
    res.status(500).send(error.message || "Erro interno do servidor.");
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
