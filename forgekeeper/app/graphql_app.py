from flask import Flask
from strawberry.flask.views import GraphQLView

from forgekeeper.app.graphql.schema import schema


def create_app() -> Flask:
    app = Flask(__name__)
    app.add_url_rule('/graphql', view_func=GraphQLView.as_view('graphql_view', schema=schema))
    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
