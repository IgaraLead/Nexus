/* global axios */
import ApiClient from '../ApiClient';

class CaptainDocument extends ApiClient {
  constructor() {
    super('captain/documents', { accountScoped: true });
  }

  get({ page = 1, searchKey, assistantId } = {}) {
    return axios.get(this.url, {
      params: {
        page,
        searchKey,
        assistant_id: assistantId,
      },
    });
  }

  sync(id) {
    return axios.post(`${this.url}/${id}/sync`);
  }
}

export default new CaptainDocument();
