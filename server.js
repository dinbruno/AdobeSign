const express = require("express");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

// Enable CORS for all origins

const app = express();
const port = 3000;

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const apiKey =
  "3AAABLblqZhDMWedNROcowLqrO_ywCMZVdqMBxn4AF7-woOw6YAo1LYkUt-xEaNnYTeeO-9tS3abHAikOuHg_Tv0qTHq0Scc2";

const name = "2805";

async function getBaseUri() {
  try {
    const response = await axios.get(
      "https://api.adobesign.com/api/rest/v6/baseUris",
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );
    return response.data.apiAccessPoint;
  } catch (error) {
    console.error("Erro ao obter o URI base:", error.response.data.message);
    return null;
  }
}

// Função para fazer upload do documento e obter o ID do documento transitório
async function uploadDocumentAndGetTransientId(filePath, baseUri) {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append("File", fileBuffer, "document.pdf");

  try {
    const response = await axios.post(
      `${baseUri}/api/rest/v6/transientDocuments`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...formData.getHeaders(),
        },
      }
    );
    return response.data.transientDocumentId;
  } catch (error) {
    console.error(
      "Erro ao fazer upload do documento:",
      error.response.data.message
    );
    return null;
  }
}

// Função para criar um widget
async function createWidget(templateId, baseUri) {
  const widgetData = {
    fileInfos: [
      {
        libraryDocumentId: templateId,
      },
    ],
    name: "Contrata Fast",
    state: "ACTIVE",
    widgetParticipantSetInfo: {
      memberInfos: [
        {
          email: "",
          securityOption: {
            authenticationMethod: "NONE",
          },
        },
      ],
      role: "SIGNER",
    },
    securityOption: {
      openPassword: "",
    },
  };

  try {
    const response = await axios.post(
      `${baseUri}/api/rest/v6/widgets`,
      widgetData,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Erro ao criar o widget:", error.response.data.message);
    return null;
  }
}

// Função para obter todos os widgets
async function getAllWidgets(baseUri) {
  try {
    const response = await axios.get(`${baseUri}/api/rest/v6/widgets`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    console.error(
      "Erro ao obter todos os widgets:",
      error.response.data.message
    );
    return null;
  }
}

async function checkWidgetStatus(widgetId, baseUri) {
  try {
    const response = await axios.get(
      `${baseUri}/api/rest/v6/widgets/${widgetId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.status === "ACTIVE";
  } catch (error) {
    console.error(
      "Erro ao verificar o status do widget:",
      error.response.data.message
    );
    return false;
  }
}

async function downloadSignedDocument(req, res, widgetId, baseUri) {
  try {
    // Verifica se o documento foi assinado
    const agreementStatus = await axios.get(
      `${baseUri}/api/rest/v6/widgets/${widgetId}/agreements`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    console.log("Status do acordo:", agreementStatus.data);

    if (agreementStatus.data.userAgreementList[0].status !== "SIGNED") {
      console.error("Documento ainda não foi assinado.");
      res.status(400).send("Documento ainda não foi assinado.");
      return;
    }

    // Obtenha o documento assinado
    const response = await axios.get(
      `${baseUri}/api/rest/v6/agreements/${agreementStatus.data.userAgreementList[0].id}/documents`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    console.log(response.data, "response.data");

    const getDocumentById = await axios.get(
      `${baseUri}/api/rest/v6/agreements/${agreementStatus.data.userAgreementList[0].id}/documents/${response.data.documents[0].id}`,
      {
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="signed_document.pdf"'
    );
    res.setHeader("Content-Type", "application/pdf");
    res.send(getDocumentById.data);
    
  } catch (error) {
    console.error("Erro ao baixar o documento assinado:", error.message);
    res.status(500).send("Erro ao baixar o documento assinado.");
  }
}

async function getAllTemplates(baseUri) {
  try {
    const response = await axios.get(
      `${baseUri}/api/rest/v6/libraryDocuments`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    return response.data; // Retorna a lista de templates
  } catch (error) {
    console.error(
      "Erro ao obter templates:",
      error.response ? error.response.data.message : error.message
    );
    return null;
  }
}

app.get("/run", async (req, res) => {
  const filePath = "./documento.pdf";

  // Obter o URI base
  const baseUri = await getBaseUri();
  if (!baseUri) {
    res.status(500).send("Falha ao obter o URI base.");
    return;
  }

  // Criar o widget
  const widgetResponse = await createWidget(
    "CBJCHBCAABAA49JwE0Hhz-nQ5lQhvHhQ1u7VfdIEqcip",
    baseUri
  );
  if (!widgetResponse) {
    res.status(500).send("Falha ao criar o widget.");
    return;
  }

  let isActive = false;
  for (let i = 0; i < 5; i++) {
    isActive = await checkWidgetStatus(widgetResponse.id, baseUri);
    console.log(`Widget status check attempt ${i + 1}:`, isActive);
    if (isActive) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (!isActive) {
    res
      .status(500)
      .send("O widget não está ativo ou não tem páginas disponíveis.");
    return;
  }

  const allWidgets = await getAllWidgets(baseUri);

  if (!allWidgets) {
    res.status(500).send("Falha ao obter todos os widgets.");
    return;
  }

  console.log("Widget criado:", widgetResponse);

  const filteredWidget = allWidgets.userWidgetList.find(
    (widget) => widget.id === widgetResponse.id
  );

  if (!filteredWidget) {
    res
      .status(500)
      .send("Widget ID não encontrado na lista de todos os widgets.");
    return;
  }

  console.log("Iframe Embed Code:", filteredWidget.url);

  res.send({
    widgetId: widgetResponse.id,
    iframeEmbedCode: filteredWidget.url,
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

app.get("/:id/document", async (req, res) => {
  const baseUri = await getBaseUri();
  if (!baseUri) {
    res.status(500).send("Falha ao obter o URI base.");
    return;
  }

  await downloadSignedDocument(
    req,
    res,
    req.params.id,
    baseUri
  );
});
