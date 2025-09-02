const cds = require('@sap/cds')
const { INSERT, DELETE, SELECT, UPSERT } = cds.ql
const { PDFLoader } = require('langchain/document_loaders/fs/pdf')
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter')
const { htmlToText } = require('html-to-text')
const path = require('path')
const fs = require('fs')
const axios = require('axios');
const cheerio = require('cheerio');
const Tesseract = require('tesseract.js');

let array2VectorBuffer = (data) => {
  const sizeFloat = 4
  const sizeDimensions = 4
  const bufferSize = data.length * sizeFloat + sizeDimensions

  const buffer = Buffer.allocUnsafe(bufferSize)
  buffer.writeUInt32LE(data.length, 0)
  data.forEach((value, index) => {
    buffer.writeFloatLE(value, index * sizeFloat + sizeDimensions)
  })
  return buffer
}

let deleteIfExists = (filePath) => {
  try {
    fs.unlink(filePath, (err) => {
      if (err) {
        if (err.code === 'ENOENT') {
          console.log('File does not exist')
        } else {
          console.error('Error deleting file:', err)
        }
      } else {
        console.log('File deleted successfully')
      }
    })
  } catch (unlinkErr) {
    console.error('Error occurred while attempting to delete file:', unlinkErr)
  }
}

module.exports = async function () {
   const vectorPlugin = await cds.connect.to('cap-llm-plugin');
  const confluence = await cds.connect.to("Confluence");
  const { DocumentChunk, SyncTable } = this.entities;
  //Scrapping
  this.on('storeScrapEmbeddings', async (req) => {
    try {
      const { documentID } = req.data
      const vectorPlugin = await cds.connect.to('cap-llm-plugin')
      const { DocumentFiles, DocumentChunk, ScrapedData } = this.entities
      const record = await SELECT.from(ScrapedData).where({ ID: documentID })
      console.log(record)

      let textChunkEntries = []
      const embeddingModelName = "text-embedding-ada-002";

      const document = await this.scrapeWebsite({ webUrl: record[0].url })
      console.log('document data', document)

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000,
        chunkOverlap: 150,
        addStartIndex: true
      })

      const textChunks = await splitter.createDocuments([document]);
      console.log(`Documents split into ${textChunks} chunks.`)

      console.log("Generating the vector embeddings for the text chunks.")
      for (const chunk of textChunks) {
        const embeddingModelConfig = cds.env.requires["GENERATIVE_AI_HUB"][embeddingModelName];
        console.log(chunk.pageContent)
        const embeddingResult = await vectorPlugin.getEmbeddingWithConfig(embeddingModelConfig, chunk.pageContent)
        let embedding = null;
        if (embeddingModelName === "text-embedding-ada-002") {
          embedding = embeddingResult?.data[0]?.embedding;
        }

        else {
          throw new Error(`Embedding model ${embeddingModelName} not supported!\n`)
        }
        const entry = {
          "text_chunk": chunk.pageContent,
          "metadata_column": record[0].url,
          "embedding": array2VectorBuffer(embedding),
          "scrapdataID_ID": documentID
        }
        console.log(entry)
        textChunkEntries.push(entry)
      }

      console.log("Inserting text chunks with embeddings into db.")
      // Insert the text chunk with embeddings into db
      const insertStatus = await INSERT.into(DocumentChunk).entries(textChunkEntries)
      if (!insertStatus) {
        throw new Error("Insertion of text chunks into db failed!")
      }


      return `Embeddings stored successfully to db.`
    } catch (error) {
      // Handle any errors that occur during the execution
      console.log('Error while generating and storing vector embeddings:', error)
      throw error
    }
  })


  this.after('CREATE', 'ScrapedData', async (result, req) => {
    try {
      console.log(result);
      const ID = result.ID;
      await this.storeScrapEmbeddings({ documentID: ID });
      return "Web content scrapped SuccessFully"
    }
    catch (error) {
      console.log("error : ", error)
      throw new Error("Error while storing embiddings  ")
    }
  });
  this.on('scrapeWebsite', async (req) => {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      };

      const url = req.data.webUrl || "https://en.wikipedia.org/wiki/India#Geography";
      const response = await axios.get(url, { headers });
      const $ = cheerio.load(response.data);

      // Remove unwanted elements
      $('script, style, nav, header, footer, .ads, .advertisement, .social-share, .comments').remove();

      // Extract page title
      let pageTitle = $('h1').first().text().trim() || $('title').first().text().trim() || 'Untitled Page';

      // Find main content area
      const contentSelectors = ['.entry-content', '.post-content', '.article-content', '.content', 'article', '.main-content', 'main'];
      let contentArea = null;
      for (let selector of contentSelectors) {
        if ($(selector).length > 0) {
          contentArea = $(selector);
          break;
        }
      }
      if (!contentArea) {
        contentArea = $('body');
      }
      let contentScrapped = "";

      // Process elements sequentially to handle async operations
      const elements = contentArea.find('h1, h2, h3, h4, h5, h6, p, li, img, iframe, a').toArray();

      for (let element of elements) {
        const el = $(element);

        if (el.is('img')) {
          const src = el.attr('src');
          console.log(src)
          if (src && src.startsWith('http')) {
            let imageUrl = src.startsWith('http') ? src : new URL(src, url).href;
            try {
              let response = await this.getTextFromImage({ image: imageUrl });
              contentScrapped = contentScrapped + "\n" + response;

            } catch (error) {
              console.error('Error analyzing image:', error);
            }
          }
        } else if (el.is('iframe')) {
          const src = el.attr('src');
          if (src) {
            contentScrapped = contentScrapped + "\n" + src;
          }
        } else if (el.is('a')) {
          const href = el.attr('href');
          const text = el.text().trim();
          if (href && text) {
            contentScrapped = contentScrapped + "\n" + text + "\n" + href;
          }
        } else {
          const text = el.text().trim();
          if (text) {
            console.log(text)
            contentScrapped = contentScrapped + "\n" + text;
          }
        }
      }
      console.log(contentScrapped)
      return contentScrapped;

    } catch (error) {
      console.error('Scraping error:', error.message);
      req.error(500, 'Scraping failed: ' + error.message);
    }
  });
  this.on('getTextFromImage', async (req) => {
    console.log('start');
    const { image } = req.data; // Send only one field: "image"
    let imageBuffer;

    try {
      if (!image || typeof image !== 'string') {
        throw new Error('No valid image input provided.');
      }

      // Check if input is base64 or URL
      if (image.startsWith('http://') || image.startsWith('https://')) {
        console.log('Detected image URL.');
        const response = await axios.get(image, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(response.data);
      } else {
        console.log('Detected Base64 image.');
        const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      }

      // Perform OCR
      console.log('Starting OCR processing...');
      const { data: { text } } = await Tesseract.recognize(
        imageBuffer,
        'eng',
        { logger: m => console.log('OCR Progress:', m) }
      );
      console.log('extracted', text)

      const cleanedText = text;
      console.log('Extracted text:', cleanedText);

      return cleanedText;

    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw error;
    }
  });
//confluence
   this.on('storeAllConfluenceEmbeddings', async (req) => {
    try {
      const { spaceKey } = req.data;
      const vectorPlugin = await cds.connect.to('cap-llm-plugin');
      const { DocumentChunk, SyncTable } = this.entities;
      const { htmlToText } = require("html-to-text");
      const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");

      const confluence = await cds.connect.to("Confluence");

      let start = 0;
      const limit = 50;
      let allPages = [];
      while (true) {
        const response = await confluence.send({
          method: "GET",
          path: `/rest/api/space/${spaceKey}/content/page?limit=${limit}&start=${start}&expand=version`
        });

        const raw = response.data || response;
        const pages = raw.results || [];
        if (pages.length === 0) break;

        allPages.push(...pages.map(p => ({
          id: p.id,
          title: p.title,
          version: p.version.number
        })));

        if (raw._links && raw._links.next) {
          start += limit;
        } else break;
      }

      console.log(`📄 Found ${allPages.length} pages in Confluence`);

      // 🔹 2. Compare with SyncTable
      const existing = await SELECT.from(SyncTable);
      const existingMap = new Map(existing.map(e => [e.pageId, e]));

      const toDelete = [];
      const toUpdate = [];
      const toInsert = [];

      // mark deletions
      for (const e of existing) {
        if (!allPages.find(p => p.id === e.pageId)) {
          toDelete.push(e.pageId);
        }
      }

      // mark new + updated
      for (const page of allPages) {
        const ex = existingMap.get(page.id);
        if (!ex) {
          toInsert.push(page);
        } else if (ex.version !== page.version) {
          toUpdate.push(page);
        }
      }

      // 🔹 3. Apply deletions
      if (toDelete.length > 0) {
        await DELETE.from(SyncTable).where({ pageId: { in: toDelete } });
        console.log(`🗑 Deleted ${toDelete.length} outdated pages`);
      }

      const failedPages = [];
      const processPage = async (page) => {
        try {
          const resp = await confluence.send({
            method: "GET",
            path: `/rest/api/content/${page.id}?expand=body.storage,version`
          });

          const htmlContent = resp.body?.storage?.value || "";
          const plainText = htmlToText(htmlContent, { wordwrap: 130 });
          if (!plainText) return;

          // Split into chunks
          const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 150,
            addStartIndex: true
          });
          const textChunks = await splitter.createDocuments([plainText]);

          let entries = [];
          for (const chunk of textChunks) {
            const embeddingModelName = "text-embedding-ada-002";
            const embeddingModelConfig = {
          "destinationName": "GenAIHubDestination",
          "deploymentUrl": `/inference/deployments/${process.env.EMBEDDING_DEPLOYMENT_ID}`,
          "resourceGroup": "default",
          "apiVersion": "2023-05-15",
          "modelName": "text-embedding-ada-002"
        };
            const embeddingResult = await vectorPlugin.getEmbeddingWithConfig(
              embeddingModelConfig,
              chunk.pageContent
            );
            const embedding = embeddingResult?.data[0]?.embedding;

            entries.push({
              text_chunk: chunk.pageContent,
              metadata_column: `confluence-page-${page.id}`,
              embedding: array2VectorBuffer(embedding),
              document_pageId: page.id   // 🔹 association to SyncTable
            });
          }

          // Replace existing if update
          await DELETE.from(DocumentChunk).where({ document_pageId: page.id });
          await INSERT.into(DocumentChunk).entries(entries);

          // Upsert SyncTable (Confluence record)
          await UPSERT.into(SyncTable).entries({
            pageId: page.id,
            title: page.title,
            version: page.version
          });

          console.log(` Stored ${entries.length} chunks for page '${page.title}' (v${page.version}).`);

        } catch (err) {
          failedPages.push({ pageId: page.id, title: page.title, error: err.message });
        }
      };

      // 🔹 4. Process inserts & updates
      for (const page of [...toInsert, ...toUpdate]) {
        await processPage(page);
      }

      return {
        message: `Sync completed. Inserted ${toInsert.length}, Updated ${toUpdate.length}, Deleted ${toDelete.length}`,
        failedPages
      };

    } catch (error) {
      console.error(" Error in storeAllConfluenceEmbeddings:", error);
      throw error;
    }
  });

  let processPage = async (pageId) => {
    const resp = await confluence.send({
      method: "GET",
      path: `/rest/api/content/${pageId}?expand=body.storage,version`
    });

    const htmlContent = resp.body?.storage?.value || "";
    const plainText = htmlToText(htmlContent, { wordwrap: 130 });
    if (!plainText) return;

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 150,
      addStartIndex: true
    });
    const textChunks = await splitter.createDocuments([plainText]);

    let entries = [];
    for (const chunk of textChunks) {
      const embeddingModelName = "text-embedding-ada-002";
      const embeddingModelConfig = {
        "destinationName": "GenAIHubDestination",
        "deploymentUrl": `/inference/deployments/${process.env.EMBEDDING_DEPLOYMENT_ID}`,
        "resourceGroup": "default",
        "apiVersion": "2023-05-15",
        "modelName": "text-embedding-ada-002"
      };
      const embeddingResult = await vectorPlugin.getEmbeddingWithConfig(
        embeddingModelConfig,
        chunk.pageContent
      );
      const embedding = embeddingResult?.data[0]?.embedding;

      entries.push({
        text_chunk: chunk.pageContent,
        metadata_column: `confluence-page-${pageId}`,
        embedding: array2VectorBuffer(embedding),
        document_pageId: pageId
      });
    }

    // Replace existing chunks
    await DELETE.from(DocumentChunk).where({ document_pageId: pageId });
    await INSERT.into(DocumentChunk).entries(entries);

    // Upsert sync record
    await UPSERT.into(SyncTable).entries({
      pageId: resp.id,
      title: resp.title,
      version: resp.version.number
    });

    console.log(`Stored ${entries.length} chunks for page '${resp.title}' (v${resp.version.number}).`);
  };

  this.on('pageCreated', async (req) => {
    const pageId = req.data.page?.id
    await processPage(pageId)
    return { message: `Page created + stored embeddings: ${pageId}` }
  })

  this.on('pageUpdated', async (req) => {
    const pageId = req.data.page?.id
    await processPage(pageId)
    return { message: `Page updated + refreshed embeddings: ${pageId}` }
  })

  this.on('pageTrashed', async (req) => {
    const pageId = req.data.page?.id
    await DELETE.from(DocumentChunk).where({ document_pageId: pageId })
    await DELETE.from(SyncTable).where({ pageId })
    return { message: `Page trashed + embeddings removed: ${pageId}` }
  })

  this.on('deleteFiles', async (req) => {
    const { DocumentFiles, SyncTable } = this.entities
    await DELETE.from(DocumentFiles)
    await DELETE.from(SyncTable)
    return 'Success'
  })

  this.after('CREATE', 'DocumentFiles', async (result) => {
    try {
      const ID = result.ID
      await this.storeEmbeddings({ documentID: ID })
      return 'Document Stored Successfully'
    } catch (error) {
      console.log('error : ', error)
      throw new Error('Error while storing embeddings')
    }
  })



  this.on('storeEmbeddings', async (req) => {
    try {
      const { documentID } = req.data
      const vectorPlugin = await cds.connect.to('cap-llm-plugin')
      const { DocumentFiles, DocumentChunk } = this.entities
      const record = await SELECT.from(DocumentFiles).where({ ID: documentID })

      const pdfBase64 = record[0].content
      const fileName = record[0].fileName
      if (!pdfBase64) throw new Error('No PDF Base64 provided!')

      const pdfBuffer = Buffer.from(pdfBase64, 'base64')
      const tempDocLocation = path.join(__dirname, fileName)
      fs.writeFileSync(tempDocLocation, pdfBuffer)
      console.log(`Temp PDF saved: ${tempDocLocation}`)

      const loader = new PDFLoader(tempDocLocation)
      const document = await loader.load()

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000,
        chunkOverlap: 150,
        addStartIndex: true
      })

      const textChunks = await splitter.splitDocuments(document)
      console.log(`Documents split into ${textChunks.length} chunks.`)

      const entries = await createEmbeddings(textChunks, 'hana', vectorPlugin, documentID)
      const insertStatus = await INSERT.into(DocumentChunk).entries(entries)

      if (!insertStatus) {
        deleteIfExists(tempDocLocation)
        throw new Error('Insertion of text chunks into db failed!')
      }

      deleteIfExists(tempDocLocation)
      console.log(`Temp file deleted: ${tempDocLocation}`)
      return `Embeddings stored successfully to db.`
    } catch (error) {
      console.log('Error while generating and storing vector embeddings:', error)
      throw error
    }
  })

  this.on('deleteEmbeddings', async () => {
    try {
      const { DocumentChunk } = this.entities
      await DELETE.from(DocumentChunk)
      return 'Success!'
    } catch (error) {
      console.log('Error while deleting the embeddings content in db:', error)
      throw error
    }
  })
}
