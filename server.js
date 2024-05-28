const express = require('express');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const port = 3000;

const apiKey = "3AAABLblqZhDMWedNROcowLqrO_ywCMZVdqMBxn4AF7-woOw6YAo1LYkUt-xEaNnYTeeO-9tS3abHAikOuHg_Tv0qTHq0Scc2";

// Função para obter o URI base da Adobe Sign
async function getBaseUri() {
  try {
    const response = await axios.get("https://api.adobesign.com/api/rest/v6/baseUris", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
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
    const response = await axios.post(`${baseUri}/api/rest/v6/transientDocuments`, formData, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...formData.getHeaders()
      }
    });
    return response.data.transientDocumentId;
  } catch (error) {
    console.error("Erro ao fazer upload do documento:", error.response.data.message);
    return null;
  }
}

// Função para criar um widget
async function createWidget(transientDocumentId, baseUri) {
  const widgetData = {
    fileInfos: [{ transientDocumentId }],
    name: "Nome do Widget",
    state: "ACTIVE",
    widgetParticipantSetInfo: {
      memberInfos: [{ email: "" }],
      role: "SIGNER"
    }
  };

  try {
    const response = await axios.post(`${baseUri}/api/rest/v6/widgets`, widgetData, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });
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
        "Content-Type": "application/json"
      }
    });

    return response.data;
  } catch (error) {
    console.error("Erro ao obter todos os widgets:", error.response.data.message);
    return null;
  }
}

// Função para baixar o documento assinado de um widget
async function downloadSignedDocument(widgetId, baseUri, savePath) {
  try {
    const response = await axios.get(`${baseUri}/api/rest/v6/widgets/${widgetId}/documents`, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    fs.writeFileSync(savePath, response.data);
    console.log(`Documento assinado salvo em: ${savePath}`);
  } catch (error) {
    console.error("Erro ao baixar o documento assinado:", error.response.data.message);
  }
}

app.get('/run', async (req, res) => {
  const filePath = "./documento.pdf";

  // Obter o URI base
  const baseUri = await getBaseUri();
  if (!baseUri) {
    res.status(500).send("Falha ao obter o URI base.");
    return;
  }

  // Fazer upload do documento e obter o ID transitório
  const transientDocumentId = await uploadDocumentAndGetTransientId(filePath, baseUri);
  if (!transientDocumentId) {
    res.status(500).send("Falha ao fazer upload do documento.");
    return;
  }

  // Criar o widget
  const widgetResponse = await createWidget(transientDocumentId, baseUri);
  if (!widgetResponse) {
    res.status(500).send("Falha ao criar o widget.");
    return;
  }

  console.log("Widget criado com sucesso. ID do widget:", widgetResponse.id);

  // Obter todos os widgets e filtrar pelo ID do widget criado
  const allWidgets = await getAllWidgets(baseUri);
  if (!allWidgets) {
    res.status(500).send("Falha ao obter todos os widgets.");
    return;
  }

  console.log("Widget criado:", widgetResponse)
  console.log("Todos os widgets:", allWidgets)

  const filteredWidget = allWidgets.userWidgetList.find(widget => widget.id === widgetResponse.id);
  if (!filteredWidget) {
    res.status(500).send("Widget ID não encontrado na lista de todos os widgets.");
    return;
  }

  console.log("Iframe Embed Code:", filteredWidget.url);

  // Baixar o documento assinado após a assinatura
  const savePath = "./documento_assinado.pdf";
  await downloadSignedDocument(filteredWidget.id, baseUri, savePath);

  res.send(`Widget successfully created. Iframe Embed Code: ${filteredWidget.url}`);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
