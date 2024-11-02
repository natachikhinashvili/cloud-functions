const { ServicesClient } = require('@google-cloud/run').v2;
const { ArtifactRegistryClient } = require('@google-cloud/artifact-registry');
require('dotenv').config();

const PROJECT_ID = process.env.PROJECT_ID;
const REGION = process.env.REGION;
const SERVICE_NAME = process.env.SERVICE_NAME;
const REPOSITORY_NAME = process.env.REPOSITORY_NAME;
const IMAGE_NAME = process.env.IMAGE_NAME;
const ACCOUNTS_URL =  process.env.ACCOUNTS_URL;
const AUCTIONS_URL =  process.env.AUCTIONS_URL;
const PORT =  process.env.PORT;

const runClient = new ServicesClient();
const artifactRegistryClient = new ArtifactRegistryClient();

exports.deployApiGateway = async (message, context) => {
  try {
    const parent = `projects/${PROJECT_ID}/locations/${REGION}/repositories/${REPOSITORY_NAME}`;
    const [images] = await artifactRegistryClient.listDockerImages({ parent });

    const filteredImages = images.filter(image => image.name.includes(`${IMAGE_NAME}`));
    if (!filteredImages.length) return console.log(`No images found for ${IMAGE_NAME}.`);

    const latestImage = filteredImages.sort((a, b) => (b.uploadTime.seconds + b.uploadTime.nanos) - (a.uploadTime.seconds + a.uploadTime.nanos))[0];

    const request = {
      service: {
        name: `projects/${PROJECT_ID}/locations/${REGION}/services/${SERVICE_NAME}`,
        template: {
          containers: [
            {
              image: latestImage.uri,
              ports: [{ containerPort: 8080 }],
              env: [
                { name: 'ACCOUNT_SERVICE_HOST', value: ACCOUNTS_URL },
                { name: 'ACCOUNT_SERVICE_PORT', value: PORT },
                { name: 'AUCTION_SERVICE_HOST', value: AUCTIONS_URL },
                { name: 'AUCTION_SERVICE_PORT', value: PORT },
              ],
            },
          ],
        }
      },
      allowMissing: false,
    };

    try {
      await runClient.getService({ name: request.service.name });
      const [updateOperation] = await runClient.updateService(request);
      await updateOperation.promise();
      console.log(`Successfully updated ${SERVICE_NAME} with image ${latestImage.uri}`);
    } catch (error) {
      if (error.code === 5) {
        const [createOperation] = await runClient.createService(request);
        await createOperation.promise();
        console.log(`Successfully created ${SERVICE_NAME} with image ${latestImage.uri}`);
      } else {
        console.error(`Error updating ${SERVICE_NAME}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error deploying ${SERVICE_NAME}: ${error.message}`);
  }
};
