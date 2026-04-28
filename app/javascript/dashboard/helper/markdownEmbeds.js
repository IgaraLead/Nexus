import yaml from 'js-yaml';
import yamlSource from '../../../../config/markdown_embeds.yml?raw';

const config = yaml.load(yamlSource);

// Gists rely on document.write() and can't render inline in the editor.
const isPreviewable = ({ template }) => !template.includes('gist.github.com');

export const embeds = Object.values(config)
  .filter(isPreviewable)
  .map(({ regex, template }) => ({
    regex: new RegExp(regex),
    template,
  }));
